import "server-only";

import { recordAuditEvent } from "@/lib/audit/service";
import { runLeadIntakeTransaction } from "@/features/lead-intake/queries";
import { createLeadIntakeService } from "@/features/lead-intake/services";

import { createMetaIntegrationService } from "./service";
import { metaEventRepository } from "./queries";

export const metaIntegrationService = createMetaIntegrationService({
  repository: metaEventRepository,
  intake: createLeadIntakeService({ transaction: runLeadIntakeTransaction }),
  audit: recordAuditEvent,
});

export { createMetaIntegrationService } from "./service";
export { parseMetaLeadResponse, parseMetaWebhookPayload, metaLeadToIntakeInput } from "./contracts";
export { verifyMetaChallenge, verifyMetaSignature } from "./verification";
