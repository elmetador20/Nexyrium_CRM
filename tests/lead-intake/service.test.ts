import { describe, expect, it } from "vitest";

import type { Lead, LeadDuplicateReview, LeadIntakeEvent, LeadSourceHistory } from "@/db/schema";
import { createLeadIntakeService } from "@/features/lead-intake/services";
import type { LeadIntakeUnitOfWork } from "@/features/lead-intake/queries";
import type { AuthorizationActor } from "@/lib/authorization/policy";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { ROLE_SLUGS } from "@/lib/authorization/roles";

const actor: AuthorizationActor = {
  userId: "sales-user",
  email: "sales@example.com",
  name: "Sales",
  isActive: true,
  roles: [ROLE_SLUGS.SALES],
  permissions: [PERMISSIONS.CRM_LEADS_CREATE, PERMISSIONS.CRM_LEADS_UPDATE],
  departmentIds: ["sales-department"],
};

function leadFixture(id: string, overrides: Partial<Lead> = {}): Lead {
  return {
    id,
    contactName: "Ada Lovelace",
    email: "ada@example.com",
    phone: null,
    normalizedEmail: "ada@example.com",
    normalizedPhone: null,
    normalizationVersion: "v1",
    companyName: null,
    source: "referral",
    sourceDetails: null,
    status: "new",
    ownerId: "sales-user",
    departmentId: "sales-department",
    notes: null,
    nextAction: null,
    nextActionAt: null,
    convertedAt: null,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function eventFixture(id: string, input: Partial<LeadIntakeEvent>): LeadIntakeEvent {
  return {
    id,
    idempotencyKey: "event-1",
    source: "manual",
    sourceIdentifier: null,
    payloadHash: "hash",
    payload: {},
    normalizedEmail: null,
    normalizedPhone: null,
    normalizationVersion: "v1",
    status: "processing",
    outcome: null,
    leadId: null,
    actorUserId: actor.userId,
    correlationId: null,
    createdAt: new Date(),
    processedAt: null,
    ...input,
  };
}

function makeHarness(existingCandidates: Lead[] = [], sourceLead: Lead | null = null) {
  const events = new Map<string, LeadIntakeEvent>();
  const reviews: LeadDuplicateReview[] = [];
  const createdLeads: Lead[] = [];
  const histories: LeadSourceHistory[] = [];
  const audits: string[] = [];
  let eventSequence = 0;
  let leadSequence = 0;

  const uow: LeadIntakeUnitOfWork = {
    async claimEvent(input) {
      const key = `${input.source}:${input.idempotencyKey}`;
      const existing = [...events.values()].find((event) => `${event.source}:${event.idempotencyKey}` === key);
      if (existing) return { kind: "existing", event: existing };
      const event = eventFixture(`event-${++eventSequence}`, input);
      events.set(event.id, event);
      return { kind: "created", event };
    },
    async lock() {},
    async findBySourceIdentity() {
      return sourceLead;
    },
    async findCandidates() {
      return existingCandidates.map((lead) => ({ lead, matchedBy: ["email"] as Array<"email" | "phone"> }));
    },
    async createLead(input) {
      const lead = leadFixture(`lead-${++leadSequence}`, input as Partial<Lead>);
      createdLeads.push(lead);
      return lead;
    },
    async addSourceHistory(input) {
      const history = { id: `history-${histories.length + 1}`, recordedAt: new Date(), ...input } as LeadSourceHistory;
      histories.push(history);
      return history;
    },
    async addSourceIdentity(input) {
      return { id: "source-1", firstSeenAt: new Date(), lastSeenAt: new Date(), ...input } as never;
    },
    async addIdentityKeys() {
      return [];
    },
    async createDuplicateReviews(input) {
      const records = input.map((value, index) => ({ id: `review-${index + 1}`, status: "pending" as const, decision: null, resolvedLeadId: null, reviewerUserId: null, reviewerNotes: null, reviewedAt: null, createdAt: new Date(), ...value }));
      reviews.push(...(records as LeadDuplicateReview[]));
      return records as LeadDuplicateReview[];
    },
    async completeEvent(input) {
      const event = events.get(input.eventId);
      if (!event) throw new Error("missing event");
      event.status = input.status;
      event.outcome = input.status;
      event.leadId = input.leadId ?? null;
      event.processedAt = new Date();
    },
    async listReviewCandidateIds(eventId) {
      return reviews.filter((review) => review.intakeEventId === eventId).map((review) => review.candidateLeadId);
    },
    async findReview(reviewId) {
      const review = reviews.find((item) => item.id === reviewId);
      if (!review) return null;
      const event = [...events.values()].find((item) => item.id === review.intakeEventId);
      const candidateLead = existingCandidates.find((lead) => lead.id === review.candidateLeadId);
      if (!event || !candidateLead) return null;
      return { review, event, candidateLead };
    },
    async resolveReviews(input) {
      for (const review of reviews.filter((item) => item.intakeEventId === input.eventId)) {
        review.status = review.id === input.reviewId && input.decision !== "reject" ? "resolved" : "rejected";
        review.decision = input.decision;
        review.resolvedLeadId = review.id === input.reviewId ? input.resolvedLeadId ?? null : null;
        review.reviewerUserId = input.reviewerUserId;
        review.reviewerNotes = input.reviewerNotes ?? null;
        review.reviewedAt = new Date();
      }
    },
    async audit(input) {
      audits.push(input.action);
    },
  };

  return {
    service: createLeadIntakeService({ transaction: async (work) => work(uow) }),
    createdLeads,
    reviews,
    histories,
    audits,
  };
}

describe("lead intake service", () => {
  it("creates one normalized lead and replays the same event idempotently", async () => {
    const harness = makeHarness();
    const input = {
      eventId: "event-1",
      source: "Manual",
      contactName: "Ada Lovelace",
      email: " ADA@EXAMPLE.COM ",
      phone: "(555) 010-1234",
      phoneCountryCode: "+1",
    };

    const first = await harness.service.ingest(actor, input);
    const second = await harness.service.ingest(actor, input);

    expect(first).toMatchObject({ outcome: "created", leadId: "lead-1" });
    expect(second).toEqual(first);
    expect(harness.createdLeads).toHaveLength(1);
    expect(harness.createdLeads[0]).toMatchObject({ normalizedEmail: "ada@example.com", normalizedPhone: "+15550101234" });
  });

  it("rejects reuse of an event id with different data", async () => {
    const harness = makeHarness();
    await harness.service.ingest(actor, { eventId: "event-1", source: "manual", contactName: "Ada", email: "ada@example.com" });

    await expect(harness.service.ingest(actor, { eventId: "event-1", source: "manual", contactName: "Grace", email: "grace@example.com" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(harness.createdLeads).toHaveLength(1);
  });

  it("links one matching lead without overwriting its CRM fields", async () => {
    const existing = leadFixture("lead-existing", { notes: "Keep me", status: "qualified" });
    const harness = makeHarness([existing]);
    const result = await harness.service.ingest(actor, { eventId: "event-1", source: "whatsapp_manual", contactName: "Ada", email: "ada@example.com" });

    expect(result).toMatchObject({ outcome: "linked_existing", leadId: "lead-existing" });
    expect(harness.createdLeads).toHaveLength(0);
    expect(existing).toMatchObject({ notes: "Keep me", status: "qualified" });
  });

  it("uses a source identifier before contact candidates", async () => {
    const sourceLead = leadFixture("lead-source", { normalizedEmail: "source@example.com" });
    const harness = makeHarness([leadFixture("lead-contact")], sourceLead);
    const result = await harness.service.ingest(actor, {
      eventId: "event-1",
      source: "meta",
      sourceIdentifier: "provider-123",
      contactName: "Ada",
      email: "ada@example.com",
    });

    expect(result).toMatchObject({ outcome: "linked_existing", leadId: "lead-source" });
  });

  it("creates review records when matching signals point to multiple leads", async () => {
    const harness = makeHarness([leadFixture("lead-one"), leadFixture("lead-two", { normalizedEmail: "other@example.com" })]);
    const result = await harness.service.ingest(actor, { eventId: "event-1", source: "manual", contactName: "Ada", email: "ada@example.com" });

    expect(result).toEqual({ eventId: "event-1", outcome: "needs_review", candidateLeadIds: ["lead-one", "lead-two"] });
    expect(harness.createdLeads).toHaveLength(0);
    expect(harness.reviews).toHaveLength(2);
  });

  it("resolves an ambiguous event by linking the selected candidate", async () => {
    const harness = makeHarness([leadFixture("lead-one"), leadFixture("lead-two", { normalizedEmail: "other@example.com" })]);
    await harness.service.ingest(actor, { eventId: "event-1", source: "manual", contactName: "Ada", email: "ada@example.com" });

    const result = await harness.service.resolveDuplicate(actor, "review-1", { decision: "link_existing" });

    expect(result).toMatchObject({ outcome: "linked_existing", leadId: "lead-one" });
    expect(harness.reviews[0]).toMatchObject({ status: "resolved", decision: "link_existing", resolvedLeadId: "lead-one" });
    expect(harness.reviews[1]).toMatchObject({ status: "rejected", decision: "link_existing" });
  });

  it("requires an intake permission", async () => {
    const harness = makeHarness();
    await expect(harness.service.ingest({ ...actor, permissions: [] }, { eventId: "event-1", source: "manual", contactName: "Ada" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
