import { and, eq, isNull, ne, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  auditLogs,
  leadDuplicateReviews,
  leadIdentityKeys,
  leadIntakeEvents,
  leadSourceHistory,
  leadSourceIdentities,
  leads,
} from "@/db/schema";
import type {
  Lead,
  LeadDuplicateReview,
  LeadIdentityKey,
  LeadIntakeEvent,
  LeadSourceHistory,
  LeadSourceIdentity,
} from "@/db/schema";

export type LeadIntakeCandidate = {
  lead: Lead;
  matchedBy: Array<"email" | "phone">;
};

export type LeadIntakeEventClaim =
  | { kind: "created"; event: LeadIntakeEvent }
  | { kind: "existing"; event: LeadIntakeEvent };

export type LeadDuplicateReviewRecord = {
  review: LeadDuplicateReview;
  event: LeadIntakeEvent;
  candidateLead: Lead;
};

export type LeadIntakeUnitOfWork = {
  claimEvent(input: typeof leadIntakeEvents.$inferInsert): Promise<LeadIntakeEventClaim>;
  lock(keys: string[]): Promise<void>;
  findBySourceIdentity(source: string, sourceIdentifier: string): Promise<Lead | null>;
  findCandidates(input: { normalizedEmail: string | null; normalizedPhone: string | null }): Promise<LeadIntakeCandidate[]>;
  createLead(input: typeof leads.$inferInsert): Promise<Lead>;
  addSourceHistory(input: typeof leadSourceHistory.$inferInsert): Promise<LeadSourceHistory>;
  addSourceIdentity(input: typeof leadSourceIdentities.$inferInsert): Promise<LeadSourceIdentity>;
  addIdentityKeys(input: Array<{ kind: "email" | "phone"; value: string; leadId: string; firstIntakeEventId: string }>): Promise<LeadIdentityKey[]>;
  createDuplicateReviews(input: Array<typeof leadDuplicateReviews.$inferInsert>): Promise<LeadDuplicateReview[]>;
  completeEvent(input: { eventId: string; status: "created" | "linked_existing" | "needs_review"; leadId?: string | null }): Promise<void>;
  listReviewCandidateIds(eventId: string): Promise<string[]>;
  findReview(reviewId: string): Promise<LeadDuplicateReviewRecord | null>;
  resolveReviews(input: {
    eventId: string;
    reviewId: string;
    decision: "link_existing" | "create_new" | "reject";
    resolvedLeadId?: string | null;
    reviewerUserId: string;
    reviewerNotes?: string | null;
  }): Promise<void>;
  audit(input: {
    actorUserId?: string | null;
    action: string;
    resourceType: string;
    resourceId?: string | null;
    outcome: "success" | "failure";
    correlationId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
};

export type LeadIntakeTransaction = <T>(work: (uow: LeadIntakeUnitOfWork) => Promise<T>) => Promise<T>;

function addCandidate(
  candidates: Map<string, LeadIntakeCandidate>,
  lead: Lead,
  matchedBy: "email" | "phone",
) {
  if (lead.archivedAt) return;
  const current = candidates.get(lead.id);
  if (current) {
    if (!current.matchedBy.includes(matchedBy)) current.matchedBy.push(matchedBy);
    return;
  }
  candidates.set(lead.id, { lead, matchedBy: [matchedBy] });
}

export const runLeadIntakeTransaction: LeadIntakeTransaction = async (work) =>
  db.transaction(async (tx) =>
    work({
      async claimEvent(input) {
        const [created] = await tx
          .insert(leadIntakeEvents)
          .values(input)
          .onConflictDoNothing({ target: [leadIntakeEvents.source, leadIntakeEvents.idempotencyKey] })
          .returning();
        if (created) return { kind: "created", event: created };

        const [existing] = await tx
          .select()
          .from(leadIntakeEvents)
          .where(and(eq(leadIntakeEvents.source, input.source), eq(leadIntakeEvents.idempotencyKey, input.idempotencyKey)))
          .limit(1);
        if (!existing) throw new Error("Lead intake event could not be claimed");
        return { kind: "existing", event: existing };
      },

      async lock(keys) {
        for (const key of [...keys].sort()) {
          await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
        }
      },

      async findBySourceIdentity(source, sourceIdentifier) {
        const [row] = await tx
          .select({ lead: leads })
          .from(leadSourceIdentities)
          .innerJoin(leads, eq(leads.id, leadSourceIdentities.leadId))
          .where(
            and(
              eq(leadSourceIdentities.source, source),
              eq(leadSourceIdentities.sourceIdentifier, sourceIdentifier),
              isNull(leads.archivedAt),
            ),
          )
          .limit(1);
        return row?.lead ?? null;
      },

      async findCandidates({ normalizedEmail, normalizedPhone }) {
        const candidates = new Map<string, LeadIntakeCandidate>();
        const identityConditions = [
          normalizedEmail ? and(eq(leadIdentityKeys.kind, "email"), eq(leadIdentityKeys.value, normalizedEmail)) : undefined,
          normalizedPhone ? and(eq(leadIdentityKeys.kind, "phone"), eq(leadIdentityKeys.value, normalizedPhone)) : undefined,
        ].filter(Boolean);

        if (identityConditions.length) {
          const rows = await tx
            .select({ kind: leadIdentityKeys.kind, lead: leads })
            .from(leadIdentityKeys)
            .innerJoin(leads, eq(leads.id, leadIdentityKeys.leadId))
            .where(or(...identityConditions));
          for (const row of rows) {
            if (row.kind === "email" || row.kind === "phone") addCandidate(candidates, row.lead, row.kind);
          }
        }

        const leadConditions = [
          normalizedEmail ? eq(leads.normalizedEmail, normalizedEmail) : undefined,
          normalizedPhone ? eq(leads.normalizedPhone, normalizedPhone) : undefined,
        ].filter(Boolean);
        if (leadConditions.length) {
          const rows = await tx
            .select()
            .from(leads)
            .where(and(isNull(leads.archivedAt), or(...leadConditions)));
          for (const lead of rows) {
            if (normalizedEmail && lead.normalizedEmail === normalizedEmail) addCandidate(candidates, lead, "email");
            if (normalizedPhone && lead.normalizedPhone === normalizedPhone) addCandidate(candidates, lead, "phone");
          }
        }

        return [...candidates.values()];
      },

      async createLead(input) {
        const [lead] = await tx.insert(leads).values(input).returning();
        if (!lead) throw new Error("Lead intake insert did not return a record");
        return lead;
      },

      async addSourceHistory(input) {
        const [history] = await tx.insert(leadSourceHistory).values(input).returning();
        if (!history) throw new Error("Lead source history insert did not return a record");
        return history;
      },

      async addSourceIdentity(input) {
        const [identity] = await tx
          .insert(leadSourceIdentities)
          .values(input)
          .onConflictDoUpdate({
            target: [leadSourceIdentities.source, leadSourceIdentities.sourceIdentifier],
            set: { lastSeenAt: new Date() },
          })
          .returning();
        if (identity) return identity;
        const [existing] = await tx
          .select()
          .from(leadSourceIdentities)
          .where(
            and(
              eq(leadSourceIdentities.source, input.source),
              eq(leadSourceIdentities.sourceIdentifier, input.sourceIdentifier),
            ),
          )
          .limit(1);
        if (!existing) throw new Error("Lead source identity could not be recorded");
        if (existing.leadId !== input.leadId) throw new Error("Lead source identity belongs to another lead");
        return existing;
      },

      async addIdentityKeys(input) {
        const inserted: LeadIdentityKey[] = [];
        for (const value of input) {
          const [existing] = await tx
            .select()
            .from(leadIdentityKeys)
            .where(and(eq(leadIdentityKeys.kind, value.kind), eq(leadIdentityKeys.value, value.value)))
            .limit(1);
          if (existing) {
            if (existing.leadId !== value.leadId) throw new Error("Lead identity belongs to another lead");
            inserted.push(existing);
            continue;
          }
          const [identity] = await tx.insert(leadIdentityKeys).values(value).returning();
          if (!identity) throw new Error("Lead identity could not be recorded");
          inserted.push(identity);
        }
        return inserted;
      },

      async createDuplicateReviews(input) {
        if (!input.length) return [];
        return tx.insert(leadDuplicateReviews).values(input).returning();
      },

      async completeEvent({ eventId, status, leadId = null }) {
        await tx
          .update(leadIntakeEvents)
          .set({ status, outcome: status, leadId, processedAt: new Date() })
          .where(eq(leadIntakeEvents.id, eventId));
      },

      async listReviewCandidateIds(eventId) {
        const rows = await tx
          .select({ candidateLeadId: leadDuplicateReviews.candidateLeadId })
          .from(leadDuplicateReviews)
          .where(eq(leadDuplicateReviews.intakeEventId, eventId));
        return rows.map((row) => row.candidateLeadId);
      },

      async findReview(reviewId) {
        const [row] = await tx
          .select({ review: leadDuplicateReviews, event: leadIntakeEvents, candidateLead: leads })
          .from(leadDuplicateReviews)
          .innerJoin(leadIntakeEvents, eq(leadIntakeEvents.id, leadDuplicateReviews.intakeEventId))
          .innerJoin(leads, eq(leads.id, leadDuplicateReviews.candidateLeadId))
          .where(eq(leadDuplicateReviews.id, reviewId))
          .limit(1);
        return row ?? null;
      },

      async resolveReviews({ eventId, reviewId, decision, resolvedLeadId = null, reviewerUserId, reviewerNotes = null }) {
        const reviewedAt = new Date();
        await tx
          .update(leadDuplicateReviews)
          .set({ status: "rejected", decision, resolvedLeadId: null, reviewerUserId, reviewerNotes, reviewedAt })
          .where(and(eq(leadDuplicateReviews.intakeEventId, eventId), ne(leadDuplicateReviews.id, reviewId)));
        await tx
          .update(leadDuplicateReviews)
          .set({ status: decision === "reject" ? "rejected" : "resolved", decision, resolvedLeadId, reviewerUserId, reviewerNotes, reviewedAt })
          .where(eq(leadDuplicateReviews.id, reviewId));
      },

      async audit(input) {
        await tx.insert(auditLogs).values(input);
      },
    }),
  );
