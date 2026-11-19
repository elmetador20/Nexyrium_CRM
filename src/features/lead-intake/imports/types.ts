import type { LeadImportJob, LeadImportRow } from "@/db/schema";

export const IMPORT_CANONICAL_COLUMNS = [
  "contactName",
  "email",
  "phone",
  "phoneCountryCode",
  "companyName",
  "sourceIdentifier",
  "sourceDetails",
  "source",
  "acquisitionSource",
  "status",
  "ownerId",
  "departmentId",
  "notes",
  "nextAction",
  "nextActionAt",
] as const;

export type ImportCanonicalColumn = (typeof IMPORT_CANONICAL_COLUMNS)[number];
export type ImportMapping = Partial<Record<ImportCanonicalColumn, string>>;
export type ImportIssue = { code: string; message: string; severity: "error" | "warning" };
export type RawImportRow = { rowNumber: number; values: Record<string, string> };

export type ImportPreview = {
  headers: string[];
  worksheetName: string | null;
  suggestedMapping: ImportMapping;
  sampleRows: RawImportRow[];
  totalRows: number;
};

export type ImportJobSummary = Pick<
  LeadImportJob,
  | "id"
  | "filename"
  | "format"
  | "fileSize"
  | "source"
  | "status"
  | "totalRows"
  | "validRows"
  | "invalidRows"
  | "createdCount"
  | "linkedCount"
  | "needsReviewCount"
  | "failedCount"
  | "errorSummary"
  | "createdAt"
  | "startedAt"
  | "completedAt"
>;

export type ImportRowSummary = Pick<
  LeadImportRow,
  | "id"
  | "rowNumber"
  | "validationIssues"
  | "status"
  | "intakeEventId"
  | "leadId"
  | "outcome"
  | "errorCode"
  | "errorMessage"
  | "processedAt"
>;
