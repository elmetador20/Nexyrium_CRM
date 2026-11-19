import { runLeadIntakeTransaction } from "@/features/lead-intake/queries";
import { createLeadIntakeService } from "@/features/lead-intake/services";
import { createImportJobTransaction, importRepository } from "@/features/lead-intake/imports/queries";
import { createLeadImportService } from "@/features/lead-intake/imports/service";
import { getServerEnv } from "@/lib/env";

export const leadImportService = createLeadImportService({
  repository: importRepository,
  createJobTransaction: createImportJobTransaction,
  intake: createLeadIntakeService({ transaction: runLeadIntakeTransaction }),
  limits: {
    maxBytes: getServerEnv().LEAD_IMPORT_MAX_FILE_BYTES,
    maxRows: getServerEnv().LEAD_IMPORT_MAX_ROWS,
    previewRows: getServerEnv().LEAD_IMPORT_PREVIEW_ROWS,
  },
});
