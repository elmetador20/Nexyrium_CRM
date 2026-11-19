import { createHash } from "node:crypto";

import type { AuditEventInput } from "@/lib/audit/service";

import { metaLeadToIntakeInput, parseMetaLeadResponse, parseMetaWebhookPayload, type MetaLeadRecord } from "./contracts";
import type { MetaEvent, MetaEventRepository } from "./queries";
import { verifyMetaChallenge, verifyMetaSignature } from "./verification";

export type MetaLogger = {
  info(event: string, metadata: Record<string, unknown>): void;
  warn(event: string, metadata: Record<string, unknown>): void;
  error(event: string, metadata: Record<string, unknown>): void;
};

export class MetaIntegrationError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) {
    super(message);
    this.name = "MetaIntegrationError";
  }
}

type MetaServiceDependencies = {
  repository: MetaEventRepository;
  intake: {
    ingestExternal(context: { sourcePrefix: string; ownerId: string | null; departmentId: string | null }, input: unknown, correlationId?: string): Promise<{ eventId: string; outcome: "created" | "linked_existing" | "needs_review"; leadId?: string }>;
  };
  audit?: (input: AuditEventInput) => Promise<void>;
  logger?: MetaLogger;
  fetcher?: typeof fetch;
};

const defaultLogger: MetaLogger = {
  info: (event, metadata) => console.info(`[meta] ${event}`, metadata),
  warn: (event, metadata) => console.warn(`[meta] ${event}`, metadata),
  error: (event, metadata) => console.error(`[meta] ${event}`, metadata),
};

function hashBody(rawBody: string): string {
  return createHash("sha256").update(rawBody, "utf8").digest("hex");
}

function safeMetadata(record: MetaLeadRecord) {
  return {
    provider: "meta",
    pageId: record.pageId,
    formId: record.formId,
    adId: record.adId,
    createdTime: record.createdTime,
  } satisfies Record<string, unknown>;
}

function getConfiguration() {
  const uuid = (value: string | undefined) => value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
  const maxBytes = Number(process.env.META_WEBHOOK_MAX_BYTES ?? "1000000");
  return {
    appId: process.env.META_APP_ID?.trim() || null,
    graphApiVersion: process.env.META_GRAPH_API_VERSION?.trim() || "v25.0",
    webhookConfigured: Boolean(process.env.META_APP_SECRET?.trim() && process.env.META_WEBHOOK_VERIFY_TOKEN?.trim()),
    leadRetrievalConfigured: Boolean(process.env.META_PAGE_ACCESS_TOKEN?.trim()),
    pageId: process.env.META_PAGE_ID?.trim() || null,
    defaultOwnerId: uuid(process.env.META_DEFAULT_OWNER_ID),
    defaultDepartmentId: uuid(process.env.META_DEFAULT_DEPARTMENT_ID),
    appSecret: process.env.META_APP_SECRET?.trim() || null,
    verifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() || null,
    pageAccessToken: process.env.META_PAGE_ACCESS_TOKEN?.trim() || null,
    maxBytes: Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : 1_000_000,
  };
}

async function fetchLeadRecord(
  record: MetaLeadRecord,
  configuration: ReturnType<typeof getConfiguration>,
  fetcher: typeof fetch,
): Promise<MetaLeadRecord> {
  if (!configuration.pageAccessToken) throw new MetaIntegrationError("META_PAGE_ACCESS_TOKEN_MISSING", "Meta lead retrieval is not configured.", 503);
  const url = new URL(`https://graph.facebook.com/${configuration.graphApiVersion}/${encodeURIComponent(record.providerLeadId)}`);
  url.searchParams.set("fields", "id,created_time,field_data,form_id");
  const response = await fetcher(url, { headers: { authorization: `Bearer ${configuration.pageAccessToken}`, accept: "application/json" } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new MetaIntegrationError("META_GRAPH_REQUEST_FAILED", `Meta lead retrieval failed with HTTP ${response.status}.`, 502);
  return parseMetaLeadResponse(body, record.providerLeadId, record.pageId, record.formId, record.adId, record.createdTime);
}

export function createMetaIntegrationService({ repository, intake, audit = async () => undefined, logger = defaultLogger, fetcher = fetch }: MetaServiceDependencies) {
  async function auditEvent(input: Parameters<NonNullable<MetaServiceDependencies["audit"]>>[0]) {
    await audit(input);
  }

  async function failEvent(event: MetaEvent, error: unknown, correlationId?: string) {
    const code = error instanceof MetaIntegrationError ? error.code : "META_PROCESSING_FAILED";
    const message = error instanceof Error ? error.message : "Meta event processing failed.";
    const updated = await repository.update(event.id, { status: "failed", errorCode: code, errorMessage: message, correlationId: correlationId ?? event.correlationId, processedAt: new Date() });
    logger.error("event_failed", { eventId: updated.id, externalEventId: updated.externalEventId, code, integrationKey: updated.integrationKey });
    await auditEvent({ actorUserId: null, action: "integration.meta.webhook.failed", resourceType: "meta_integration_event", resourceId: updated.id, outcome: "failure", correlationId: updated.correlationId, metadata: { code, integrationKey: updated.integrationKey } });
    return updated;
  }

  async function processRecord(record: MetaLeadRecord, payloadHash: string, signatureStatus: "verified" | "rejected" | "missing", correlationId?: string) {
    const configuration = getConfiguration();
    const integrationKey = `page:${record.pageId}`;
    const claimed = await repository.claim({
      provider: "meta",
      integrationKey,
      externalEventId: record.providerLeadId,
      eventType: "leadgen",
      pageId: record.pageId,
      formId: record.formId,
      payloadHash,
      signatureStatus,
      status: "received",
      safeMetadata: safeMetadata(record),
      intakeEventIds: [],
      leadIds: [],
      attemptCount: 1,
      correlationId: correlationId ?? null,
    });
    if (!claimed.created && !claimed.retryable && ["processed", "duplicate", "processing", "needs_review"].includes(claimed.event.status)) {
      await repository.update(claimed.event.id, { status: "duplicate", safeMetadata: { ...claimed.event.safeMetadata, duplicateDelivery: true } });
      return { event: claimed.event, outcome: "duplicate" as const, leadId: undefined, intakeEventId: undefined };
    }

    const processing = await repository.update(claimed.event.id, { status: "processing", attemptCount: claimed.event.attemptCount || 1, errorCode: null, errorMessage: null, correlationId: correlationId ?? null });
    try {
      const lead = await fetchLeadRecord(record, configuration, fetcher);
      const result = await intake.ingestExternal(
        { sourcePrefix: "meta:", ownerId: configuration.defaultOwnerId, departmentId: configuration.defaultDepartmentId },
        metaLeadToIntakeInput(lead, { source: `meta:${record.pageId}`, ownerId: configuration.defaultOwnerId, departmentId: configuration.defaultDepartmentId }),
        correlationId,
      );
      const updated = await repository.update(processing.id, { status: result.outcome === "needs_review" ? "needs_review" : "processed", intakeEventIds: [result.eventId], leadIds: result.leadId ? [result.leadId] : [], processedAt: new Date(), safeMetadata: { ...safeMetadata(record), outcome: result.outcome } });
      logger.info("event_processed", { eventId: updated.id, externalEventId: updated.externalEventId, outcome: result.outcome, integrationKey: updated.integrationKey });
      await auditEvent({ actorUserId: null, action: "integration.meta.webhook.processed", resourceType: "meta_integration_event", resourceId: updated.id, outcome: "success", correlationId, metadata: { integrationKey: updated.integrationKey, outcome: result.outcome, leadId: result.leadId ?? null } });
      return { event: updated, outcome: result.outcome, leadId: result.leadId, intakeEventId: result.eventId };
    } catch (error) {
      const failed = await failEvent(processing, error, correlationId);
      return { event: failed, outcome: "failed" as const, leadId: undefined, intakeEventId: undefined };
    }
  }

  return {
    verifyChallenge(input: { mode: string | null; verifyToken: string | null; challenge: string | null }) {
      const configuration = getConfiguration();
      return verifyMetaChallenge({ ...input, configuredToken: configuration.verifyToken });
    },

    async receive(input: { rawBody: string; signatureHeader: string | null; correlationId: string }) {
      const configuration = getConfiguration();
      if (Buffer.byteLength(input.rawBody, "utf8") > configuration.maxBytes) throw new MetaIntegrationError("META_WEBHOOK_TOO_LARGE", "The Meta webhook payload is too large.", 413);
      const payloadHash = hashBody(input.rawBody);
      const verified = verifyMetaSignature({ rawBody: input.rawBody, signatureHeader: input.signatureHeader, appSecret: configuration.appSecret });
      if (!verified) {
        const rejected = await repository.claim({ provider: "meta", integrationKey: "unverified", externalEventId: `rejected:${payloadHash}`, eventType: "webhook", payloadHash, signatureStatus: input.signatureHeader ? "rejected" : "missing", status: "rejected", safeMetadata: { provider: "meta", reason: input.signatureHeader ? "invalid_signature" : "missing_signature" }, intakeEventIds: [], leadIds: [], attemptCount: 1, correlationId: input.correlationId });
        await auditEvent({ actorUserId: null, action: "integration.meta.webhook.rejected", resourceType: "meta_integration_event", resourceId: rejected.event.id, outcome: "failure", correlationId: input.correlationId, metadata: { reason: input.signatureHeader ? "invalid_signature" : "missing_signature" } });
        logger.warn("webhook_rejected", { eventId: rejected.event.id, reason: input.signatureHeader ? "invalid_signature" : "missing_signature" });
        throw new MetaIntegrationError("META_SIGNATURE_INVALID", "Meta webhook signature verification failed.", 401);
      }

      let records: MetaLeadRecord[];
      try {
        records = parseMetaWebhookPayload(JSON.parse(input.rawBody));
      } catch {
        const failed = await repository.claim({ provider: "meta", integrationKey: "app", externalEventId: `invalid:${payloadHash}`, eventType: "webhook", payloadHash, signatureStatus: "verified", status: "failed", safeMetadata: { provider: "meta", reason: "invalid_payload" }, intakeEventIds: [], leadIds: [], attemptCount: 1, correlationId: input.correlationId });
        await failEvent(failed.event, new MetaIntegrationError("META_INVALID_PAYLOAD", "The Meta webhook payload is invalid."), input.correlationId);
        throw new MetaIntegrationError("META_INVALID_PAYLOAD", "The Meta webhook payload is invalid.");
      }

      const results = await Promise.all(records.map((record) => processRecord(record, payloadHash, "verified", input.correlationId)));
      const status = results.some((result) => result.outcome === "failed") ? "failed" : results.some((result) => result.outcome === "needs_review") ? "needs_review" : results.every((result) => result.outcome === "duplicate") ? "duplicate" : "processed";
      return { status, eventIds: results.map((result) => result.event.id), intakeEventIds: results.flatMap((result) => result.intakeEventId ? [result.intakeEventId] : []), leadIds: results.flatMap((result) => result.leadId ? [result.leadId] : []) };
    },

    async retry(eventId: string, correlationId?: string) {
      const event = await repository.findById(eventId);
      if (!event) throw new MetaIntegrationError("META_EVENT_NOT_FOUND", "Meta integration event not found.", 404);
      if (!event.pageId || event.eventType !== "leadgen") throw new MetaIntegrationError("META_EVENT_NOT_RETRYABLE", "This Meta event cannot be retried.", 400);
      const result = await processRecord({ providerLeadId: event.externalEventId, pageId: event.pageId, formId: event.formId, adId: null, createdTime: null, fieldData: {} }, event.payloadHash, "verified", correlationId ?? event.correlationId ?? undefined);
      return result.event;
    },

    async getEvent(eventId: string) {
      const event = await repository.findById(eventId);
      if (!event) throw new MetaIntegrationError("META_EVENT_NOT_FOUND", "Meta integration event not found.", 404);
      return event;
    },

    async status(input: { page: number; pageSize: number; status?: string }) {
      let configuration;
      try {
        const fullConfiguration = getConfiguration();
        configuration = {
          appId: fullConfiguration.appId,
          graphApiVersion: fullConfiguration.graphApiVersion,
          webhookConfigured: fullConfiguration.webhookConfigured,
          leadRetrievalConfigured: fullConfiguration.leadRetrievalConfigured,
          pageId: fullConfiguration.pageId,
          defaultOwnerId: fullConfiguration.defaultOwnerId,
          defaultDepartmentId: fullConfiguration.defaultDepartmentId,
          maxBytes: fullConfiguration.maxBytes,
        };
      } catch {
        configuration = { webhookConfigured: false, leadRetrievalConfigured: false, configurationError: "Invalid Meta environment configuration." };
      }
      return { configuration, events: await repository.list(input) };
    },
  };
}
