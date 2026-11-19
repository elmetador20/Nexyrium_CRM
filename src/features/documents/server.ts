import { getGoogleDriveEnv } from "@/lib/env";
import { recordAuditEvent } from "@/lib/audit/service";
import { createConfiguredGoogleDriveStorageAdapter } from "@/features/integrations/google-drive";

import { createDocumentService } from "./services";
import { documentRepository } from "./queries";

export function getDocumentService() {
  let env;
  try {
    env = getGoogleDriveEnv();
  } catch {
    env = {
      GOOGLE_DRIVE_MAX_FILE_BYTES: 25_000_000,
      GOOGLE_DRIVE_ALLOWED_MIME_TYPES: "application/pdf,image/jpeg,image/png,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
  }
  return createDocumentService({
    repository: documentRepository,
    storageFactory: createConfiguredGoogleDriveStorageAdapter,
    limits: {
      maxFileBytes: env.GOOGLE_DRIVE_MAX_FILE_BYTES,
      allowedMimeTypes: new Set(env.GOOGLE_DRIVE_ALLOWED_MIME_TYPES.split(",").map((value) => value.trim()).filter(Boolean)),
    },
    audit: recordAuditEvent,
  });
}
