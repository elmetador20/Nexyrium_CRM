import { manualCrmLeadSchema } from "../schemas";
import { createHash } from "node:crypto";

import { leadIntakeEvents } from "@/db/schema";
import { formatSourceDetails } from "@/features/crm/leads/acquisition-source";
import { CrmError } from "@/features/crm/shared/errors";
import { getCrmScope } from "@/features/crm/shared/types";
import { requireCrmPermission, resolveCrmAssignment } from "@/features/crm/shared/service";
import { canAccessRecord, type AuthorizationActor } from "@/lib/authorization/policy";
import { PERMISSIONS } from "@/lib/authorization/permissions";

import { normalizeLeadContact } from "../normalization";
import { duplicateResolutionSchema, leadIntakeSchema, type LeadIntakeInput } from "../schemas";
import type { LeadIntakeTransaction, LeadIntakeUnitOfWork } from "../queries";

export type LeadIntakeResult = {
  replayed?: boolean;
  eventId: string;
  outcome: "created" | "linked_existing" | "needs_review";
  leadId?: string;
  candidateLeadIds?: string[];
};

type IntakeServiceDependencies = {
  transaction: LeadIntakeTransaction;
};

type IntakeContext = {
  actorUserId: string | null;
  ownerId: string | null;
  departmentId: string | null;
};

function stableJson(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashPayload(input: Record<string, unknown>): string {
  return createHash("sha256").update(stableJson(input)).digest("hex");
}

function normalizeInput(input: LeadIntakeInput) {
  const contact = normalizeLeadContact(input);
  const source = input.source.trim().toLowerCase();
  const sourceIdentifier = input.sourceIdentifier?.trim() || null;
  const { acquisitionSource, ...fields } = input;
  const payload = {
    ...fields,
    ...(acquisitionSource ? { acquisitionSource } : {}),
    source,
    sourceIdentifier,
    email: input.email || null,
    phone: input.phone || null,
    phoneCountryCode: input.phoneCountryCode || null,
    companyName: input.companyName || null,
    sourceDetails: input.sourceDetails || null,
    notes: input.notes || null,
    nextAction: input.nextAction || null,
    nextActionAt: input.nextActionAt?.toISOString() ?? null,
    normalizedEmail: contact.normalizedEmail,
    normalizedPhone: contact.normalizedPhone,
    normalizationVersion: contact.normalizationVersion,
  } satisfies Record<string, unknown>;

  return { ...input, ...contact, source, sourceIdentifier, payload, sourceDetails: formatSourceDetails(input.sourceDetails, input.acquisitionSource) };
}

function replayResult(event: typeof leadIntakeEvents.$inferSelect, candidateLeadIds: string[]): LeadIntakeResult {
  if (event.status === "processing" || !event.outcome) {
    throw new CrmError("CONFLICT", "This lead intake event is still being processed.");
  }
  return {
    eventId: event.id,
    outcome: event.outcome,
    ...(event.leadId ? { leadId: event.leadId } : {}),
    ...(candidateLeadIds.length ? { candidateLeadIds } : {}),
  };
}

function identityValues(input: ReturnType<typeof normalizeInput>, leadId: string, eventId: string) {
  return [
    input.normalizedEmail ? { kind: "email" as const, value: input.normalizedEmail, leadId, firstIntakeEventId: eventId } : null,
    input.normalizedPhone ? { kind: "phone" as const, value: input.normalizedPhone, leadId, firstIntakeEventId: eventId } : null,
  ].filter((value): value is NonNullable<typeof value> => value !== null);
}

async function completeLinkedIntake(
  uow: LeadIntakeUnitOfWork,
  input: ReturnType<typeof normalizeInput>,
  event: typeof leadIntakeEvents.$inferSelect,
  leadId: string,
  actorUserId: string | null,
  correlationId?: string,
  attachContactKeys = true,
): Promise<LeadIntakeResult> {
  await uow.addSourceHistory({
    leadId,
    source: input.source,
    details: input.sourceDetails || null,
    recordedByUserId: actorUserId,
  });
  if (input.sourceIdentifier) {
    await uow.addSourceIdentity({
      source: input.source,
      sourceIdentifier: input.sourceIdentifier,
      leadId,
      firstIntakeEventId: event.id,
    });
  }
  if (attachContactKeys) await uow.addIdentityKeys(identityValues(input, leadId, event.id));
  await uow.completeEvent({ eventId: event.id, status: "linked_existing", leadId });
  await uow.audit({
    actorUserId,
    action: "lead.intake.ingest",
    resourceType: "lead",
    resourceId: leadId,
    outcome: "success",
    correlationId,
    metadata: { source: input.source, outcome: "linked_existing" },
  });
  return { eventId: event.id, outcome: "linked_existing", leadId };
}

async function runIngest(
  transaction: LeadIntakeTransaction,
  rawInput: unknown,
  context: IntakeContext,
  correlationId?: string,
): Promise<LeadIntakeResult> {
  const parsed = leadIntakeSchema.parse(rawInput);
  const input = normalizeInput(parsed);
  const payload = input.payload;
  const payloadHash = hashPayload(payload);

  return transaction(async (uow) => {
    const claim = await uow.claimEvent({
      idempotencyKey: input.eventId,
      source: input.source,
      sourceIdentifier: input.sourceIdentifier,
      payloadHash,
      payload,
      normalizedEmail: input.normalizedEmail,
      normalizedPhone: input.normalizedPhone,
      normalizationVersion: input.normalizationVersion,
      actorUserId: context.actorUserId,
      correlationId: correlationId ?? null,
    });

    if (claim.kind === "existing") {
      const candidateLeadIds = await uow.listReviewCandidateIds(claim.event.id);
      if (claim.event.payloadHash !== payloadHash) {
        throw new CrmError("CONFLICT", "This event ID was already used with different lead data.");
      }
      const replay = replayResult(claim.event, candidateLeadIds);
      return input.eventId.startsWith("ycloud:") ? { ...replay, replayed: true } : replay;
    }

    const lockKeys = [
      input.normalizedEmail ? `email:${input.normalizedEmail}` : null,
      input.normalizedPhone ? `phone:${input.normalizedPhone}` : null,
      input.sourceIdentifier ? `source:${input.source}:${input.sourceIdentifier}` : null,
    ].filter((value): value is string => value !== null);
    await uow.lock(lockKeys);

    const sourceLead = input.sourceIdentifier
      ? await uow.findBySourceIdentity(input.source, input.sourceIdentifier)
      : null;
    const candidates = await uow.findCandidates(input);

    if (sourceLead) {
      const hasConflictingContactCandidate = candidates.some((candidate) => candidate.lead.id !== sourceLead.id);
      return completeLinkedIntake(
        uow,
        input,
        claim.event,
        sourceLead.id,
        context.actorUserId,
        correlationId,
        !hasConflictingContactCandidate,
      );
    }

    if (candidates.length === 1) {
      return completeLinkedIntake(uow, input, claim.event, candidates[0].lead.id, context.actorUserId, correlationId);
    }

    if (candidates.length > 1) {
      await uow.createDuplicateReviews(
        candidates.map((candidate) => ({
          intakeEventId: claim.event.id,
          candidateLeadId: candidate.lead.id,
          matchedBy: candidate.matchedBy,
        })),
      );
      await uow.completeEvent({ eventId: claim.event.id, status: "needs_review" });
      await uow.audit({
        actorUserId: context.actorUserId,
        action: "lead.intake.review_required",
        resourceType: "lead_intake_event",
        resourceId: claim.event.id,
        outcome: "success",
        correlationId,
        metadata: { source: input.source, candidateCount: candidates.length },
      });
      return {
        eventId: claim.event.id,
        outcome: "needs_review",
        candidateLeadIds: candidates.map((candidate) => candidate.lead.id),
      };
    }

    const lead = await uow.createLead({
      contactName: input.contactName,
      email: input.email || null,
      phone: input.phone || null,
      normalizedEmail: input.normalizedEmail,
      normalizedPhone: input.normalizedPhone,
      normalizationVersion: input.normalizationVersion,
      companyName: input.companyName || null,
      source: input.source,
      sourceDetails: input.sourceDetails || null,
      status: input.status,
      ownerId: context.ownerId,
      departmentId: context.departmentId,
      notes: input.notes || null,
      nextAction: input.nextAction || null,
      nextActionAt: input.nextActionAt || null,
    });
    await uow.addSourceHistory({
      leadId: lead.id,
      source: lead.source,
      details: lead.sourceDetails,
      recordedByUserId: context.actorUserId,
    });
    if (input.sourceIdentifier) {
      await uow.addSourceIdentity({
        source: input.source,
        sourceIdentifier: input.sourceIdentifier,
        leadId: lead.id,
        firstIntakeEventId: claim.event.id,
      });
    }
    await uow.addIdentityKeys(identityValues(input, lead.id, claim.event.id));
    await uow.completeEvent({ eventId: claim.event.id, status: "created", leadId: lead.id });
    await uow.audit({
      actorUserId: context.actorUserId,
      action: "lead.intake.ingest",
      resourceType: "lead",
      resourceId: lead.id,
      outcome: "success",
      correlationId,
      metadata: { source: input.source, outcome: "created" },
    });
    return { eventId: claim.event.id, outcome: "created", leadId: lead.id };
  });
}

export function createLeadIntakeService({ transaction }: IntakeServiceDependencies) {
  return {
    async ingest(actor: AuthorizationActor, rawInput: unknown, correlationId?: string): Promise<LeadIntakeResult> {
      requireCrmPermission(actor, PERMISSIONS.CRM_LEADS_CREATE);
      const manual = rawInput && typeof rawInput === "object" && "entryMode" in rawInput && rawInput.entryMode === "crm_form";
      const parsed = (manual ? manualCrmLeadSchema : leadIntakeSchema).parse(rawInput);
      const input = normalizeInput(parsed);
      const assignment = resolveCrmAssignment(actor, input.ownerId, input.departmentId);
      return runIngest(transaction, rawInput, { actorUserId: actor.userId, ownerId: assignment.ownerId, departmentId: assignment.departmentId }, correlationId);
    },

    async ingestExternal(
      context: { sourcePrefix: string; ownerId: string | null; departmentId: string | null },
      rawInput: unknown,
      correlationId?: string,
    ): Promise<LeadIntakeResult> {
      const parsed = leadIntakeSchema.parse(rawInput);
      if (!parsed.source.startsWith(context.sourcePrefix)) {
        throw new CrmError("FORBIDDEN", "This integration cannot submit the selected lead source.");
      }
      return runIngest(transaction, rawInput, { actorUserId: null, ownerId: context.ownerId, departmentId: context.departmentId }, correlationId);
    },

    async resolveDuplicate(
      actor: AuthorizationActor,
      reviewId: string,
      rawInput: unknown,
      correlationId?: string,
    ): Promise<LeadIntakeResult> {
      requireCrmPermission(actor, PERMISSIONS.CRM_LEADS_UPDATE);
      const decision = duplicateResolutionSchema.parse(rawInput);

      return transaction(async (uow) => {
        const record = await uow.findReview(reviewId);
        if (!record) throw new CrmError("NOT_FOUND", "Duplicate review not found.");
        if (record.review.status !== "pending" || record.event.status !== "needs_review") {
          throw new CrmError("CONFLICT", "This duplicate review has already been resolved.");
        }

        const scope = getCrmScope(actor);
        const recordScope = scope.kind === "global" ? "global" : scope.kind === "department" ? "department" : "owner";
        if (!canAccessRecord(actor, PERMISSIONS.CRM_LEADS_UPDATE, { ownerUserId: record.candidateLead.ownerId, departmentId: record.candidateLead.departmentId }, recordScope)) {
          throw new CrmError("FORBIDDEN", "You cannot resolve this duplicate review.");
        }

        const parsed = leadIntakeSchema.parse(record.event.payload);
        const input = normalizeInput(parsed);
        const lockKeys = [
          input.normalizedEmail ? `email:${input.normalizedEmail}` : null,
          input.normalizedPhone ? `phone:${input.normalizedPhone}` : null,
          input.sourceIdentifier ? `source:${input.source}:${input.sourceIdentifier}` : null,
        ].filter((value): value is string => value !== null);
        await uow.lock(lockKeys);
        const candidateLeadIds = await uow.listReviewCandidateIds(record.event.id);

        if (decision.decision === "link_existing") {
          const result = await completeLinkedIntake(
            uow,
            input,
            record.event,
            record.candidateLead.id,
            actor.userId,
            correlationId,
            false,
          );
          await uow.resolveReviews({
            eventId: record.event.id,
            reviewId,
            decision: decision.decision,
            resolvedLeadId: record.candidateLead.id,
            reviewerUserId: actor.userId,
            reviewerNotes: decision.reviewerNotes ?? null,
          });
          return result;
        }

        if (decision.decision === "reject") {
          await uow.resolveReviews({
            eventId: record.event.id,
            reviewId,
            decision: decision.decision,
            reviewerUserId: actor.userId,
            reviewerNotes: decision.reviewerNotes ?? null,
          });
          await uow.audit({
            actorUserId: actor.userId,
            action: "lead.intake.review_resolved",
            resourceType: "lead_intake_event",
            resourceId: record.event.id,
            outcome: "success",
            correlationId,
            metadata: { decision: "reject" },
          });
          return { eventId: record.event.id, outcome: "needs_review", candidateLeadIds };
        }

        const assignment = resolveCrmAssignment(actor, input.ownerId, input.departmentId);
        const lead = await uow.createLead({
          contactName: input.contactName,
          email: input.email || null,
          phone: input.phone || null,
          normalizedEmail: input.normalizedEmail,
          normalizedPhone: input.normalizedPhone,
          normalizationVersion: input.normalizationVersion,
          companyName: input.companyName || null,
          source: input.source,
          sourceDetails: input.sourceDetails || null,
          status: input.status,
          ownerId: assignment.ownerId,
          departmentId: assignment.departmentId,
          notes: input.notes || null,
          nextAction: input.nextAction || null,
          nextActionAt: input.nextActionAt || null,
        });
        await uow.addSourceHistory({
          leadId: lead.id,
          source: lead.source,
          details: lead.sourceDetails,
          recordedByUserId: actor.userId,
        });
        if (input.sourceIdentifier) {
          await uow.addSourceIdentity({
            source: input.source,
            sourceIdentifier: input.sourceIdentifier,
            leadId: lead.id,
            firstIntakeEventId: record.event.id,
          });
        }
        await uow.completeEvent({ eventId: record.event.id, status: "created", leadId: lead.id });
        await uow.resolveReviews({
          eventId: record.event.id,
          reviewId,
          decision: decision.decision,
          resolvedLeadId: lead.id,
          reviewerUserId: actor.userId,
          reviewerNotes: decision.reviewerNotes ?? null,
        });
        await uow.audit({
          actorUserId: actor.userId,
          action: "lead.intake.review_resolved",
          resourceType: "lead",
          resourceId: lead.id,
          outcome: "success",
          correlationId,
          metadata: { decision: "create_new", source: input.source },
        });
        return { eventId: record.event.id, outcome: "created", leadId: lead.id };
      });
    },
  };
}
