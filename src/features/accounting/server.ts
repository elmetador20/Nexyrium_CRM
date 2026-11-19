import "server-only";

import { getGoogleDriveEnv } from "@/lib/env";
import { createConfiguredGoogleDriveStorageAdapter } from "@/features/integrations/google-drive";
import { createExpenseService } from "./services/expense-service";
import { createExpenseReceiptService } from "./services/receipt-service";
import { createJournalEntryService } from "./services/journal-entry-service";
import { createAccountingAdminService } from "./services/admin-service";
import { createReconciliationService } from "./services/reconciliation-service";

function storageLimits() {
  try {
    const env = getGoogleDriveEnv();
    return { maxFileBytes: env.GOOGLE_DRIVE_MAX_FILE_BYTES, allowedMimeTypes: new Set(env.GOOGLE_DRIVE_ALLOWED_MIME_TYPES.split(",").map((value) => value.trim()).filter(Boolean)) };
  } catch {
    return { maxFileBytes: 25_000_000, allowedMimeTypes: new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]) };
  }
}

export const expenseService = createExpenseService();
export const expenseReceiptService = createExpenseReceiptService({ storageFactory: createConfiguredGoogleDriveStorageAdapter, ...storageLimits() });
export const journalEntryService = createJournalEntryService();
export const accountingAdminService = createAccountingAdminService();
export const reconciliationService = createReconciliationService();
