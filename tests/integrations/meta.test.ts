import { createHmac } from "node:crypto";

import { describe, expect, it, beforeEach } from "vitest";

import { createMetaIntegrationService, type MetaLogger } from "@/features/integrations/meta/service";
import type { MetaEvent, MetaEventRepository } from "@/features/integrations/meta/queries";
import { metaLeadToIntakeInput, parseMetaWebhookPayload } from "@/features/integrations/meta/contracts";
import { verifyMetaChallenge, verifyMetaSignature } from "@/features/integrations/meta/verification";

const secret = "test-meta-app-secret";
const payload = JSON.stringify({ object: "page", entry: [{ id: "page-1", changes: [{ field: "leadgen", value: { leadgen_id: "leadgen-1", page_id: "page-1", form_id: "form-1" } }] }] });

beforeEach(() => {
  process.env.META_APP_SECRET = secret;
  process.env.META_WEBHOOK_VERIFY_TOKEN = "verify-token";
  process.env.META_PAGE_ACCESS_TOKEN = "page-token";
  process.env.META_GRAPH_API_VERSION = "v25.0";
});

describe("Meta webhook verification", () => {
  it("accepts the documented subscription challenge only with the configured token", () => {
    expect(verifyMetaChallenge({ mode: "subscribe", verifyToken: "verify-token", challenge: "challenge-123", configuredToken: "verify-token" })).toEqual({ ok: true, challenge: "challenge-123" });
    expect(verifyMetaChallenge({ mode: "subscribe", verifyToken: "wrong", challenge: "challenge-123", configuredToken: "verify-token" }).ok).toBe(false);
  });

  it("validates the raw x-hub-signature-256 body and rejects reserialized data", () => {
    const signature = `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
    expect(verifyMetaSignature({ rawBody: payload, signatureHeader: signature, appSecret: secret })).toBe(true);
    expect(verifyMetaSignature({ rawBody: JSON.stringify(JSON.parse(payload)), signatureHeader: signature, appSecret: secret })).toBe(true);
    expect(verifyMetaSignature({ rawBody: `${payload} `, signatureHeader: signature, appSecret: secret })).toBe(false);
    expect(verifyMetaSignature({ rawBody: payload, signatureHeader: null, appSecret: secret })).toBe(false);
  });
});

describe("Meta webhook processing", () => {
  it("maps a synthetic leadgen notification and processes a repeated delivery once", async () => {
    const events = new Map<string, MetaEvent>();
    let intakeCalls = 0;
    const logs: string[] = [];
    const logger: MetaLogger = { info: (event) => logs.push(event), warn: (event) => logs.push(event), error: (event) => logs.push(event) };
    const repository = {
      async claim(input) {
        const key = `${input.integrationKey}:${input.externalEventId}`;
        const existing = events.get(key);
        if (existing) return { event: existing, created: false, retryable: false };
        const event = { id: `event-${events.size + 1}`, updatedAt: new Date(), ...input, status: input.status ?? "received", attemptCount: input.attemptCount ?? 1 } as MetaEvent;
        events.set(key, event);
        return { event, created: true, retryable: true };
      },
      async update(id, input) {
        const event = [...events.values()].find((candidate) => candidate.id === id);
        if (!event) throw new Error("event not found");
        Object.assign(event, input);
        return event;
      },
      async findById(id) { return [...events.values()].find((event) => event.id === id) ?? null; },
      async list() { return { items: [...events.values()], total: events.size }; },
    } satisfies MetaEventRepository;
    const service = createMetaIntegrationService({
      repository,
      logger,
      intake: { async ingestExternal(_context, input) { intakeCalls += 1; expect(input).toMatchObject({ sourceIdentifier: "leadgen-1", contactName: "Ada Lovelace", email: "ada@example.com" }); return { eventId: "intake-1", outcome: "created", leadId: "lead-1" }; } },
      audit: async () => undefined,
      fetcher: async () => new Response(JSON.stringify({ id: "leadgen-1", field_data: [{ field: "full_name", values: ["Ada Lovelace"] }, { field: "email", values: ["ada@example.com"] }] }), { status: 200, headers: { "content-type": "application/json" } }),
    });
    const signature = `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;

    const first = await service.receive({ rawBody: payload, signatureHeader: signature, correlationId: "correlation-1" });
    const second = await service.receive({ rawBody: payload, signatureHeader: signature, correlationId: "correlation-2" });

    expect(parseMetaWebhookPayload(JSON.parse(payload))).toHaveLength(1);
    expect(metaLeadToIntakeInput({ providerLeadId: "leadgen-1", pageId: "page-1", formId: "form-1", adId: null, createdTime: null, fieldData: { full_name: "Ada Lovelace" } }, { source: "meta:page-1" })).toMatchObject({ contactName: "Ada Lovelace" });
    expect(first).toMatchObject({ status: "processed", leadIds: ["lead-1"] });
    expect(second).toMatchObject({ status: "duplicate" });
    expect(intakeCalls).toBe(1);
    expect(logs).toContain("event_processed");
  });

  it("rejects an unsigned synthetic webhook without calling intake", async () => {
    const repository: MetaEventRepository = { claim: async (input) => ({ event: { id: "rejected-1", updatedAt: new Date(), ...input, status: input.status ?? "rejected", attemptCount: input.attemptCount ?? 1 } as MetaEvent, created: true, retryable: false }), update: async (_id, input) => ({ id: "rejected-1", updatedAt: new Date(), ...input } as MetaEvent), findById: async () => null, list: async () => ({ items: [], total: 0 }) };
    const service = createMetaIntegrationService({ repository, intake: { async ingestExternal() { throw new Error("must not run"); } }, audit: async () => undefined });
    await expect(service.receive({ rawBody: payload, signatureHeader: null, correlationId: "correlation-2" })).rejects.toMatchObject({ code: "META_SIGNATURE_INVALID", status: 401 });
  });
});
