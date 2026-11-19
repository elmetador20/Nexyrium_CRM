import { leadIntakeSchema } from "../schemas";
import { normalizeEmail, normalizePhone } from "../normalization";
import { IMPORT_CANONICAL_COLUMNS, type ImportCanonicalColumn, type ImportIssue, type ImportMapping, type RawImportRow } from "./types";
import { LeadImportError } from "./errors";

export function parseMapping(raw: unknown): ImportMapping {
  if (raw === undefined || raw === null || raw === "") return {};
  if (typeof raw === "string") {
    try {
      return parseMapping(JSON.parse(raw));
    } catch {
      throw new LeadImportError("MISSING_REQUIRED_HEADER", "Column mapping must be valid JSON.");
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new LeadImportError("MISSING_REQUIRED_HEADER", "Column mapping must be an object.");
  }
  const mapping: ImportMapping = {};
  for (const [canonical, header] of Object.entries(raw as Record<string, unknown>)) {
    if (!IMPORT_CANONICAL_COLUMNS.includes(canonical as ImportCanonicalColumn)) continue;
    if (typeof header === "string" && header.trim()) mapping[canonical as ImportCanonicalColumn] = header.trim();
  }
  return mapping;
}

export function validateMapping(headers: string[], mapping: ImportMapping): ImportIssue[] {
  const issues: ImportIssue[] = [];
  const headerSet = new Set(headers);
  const mappedHeaders = new Set<string>();
  for (const [canonical, header] of Object.entries(mapping)) {
    if (!headerSet.has(header)) {
      issues.push({ code: "MAPPED_HEADER_NOT_FOUND", message: `Mapped header "${header}" for ${canonical} was not found.`, severity: "error" });
    }
    if (mappedHeaders.has(header)) {
      issues.push({ code: "MAPPED_HEADER_REUSED", message: `Header "${header}" is mapped to more than one field.`, severity: "error" });
    }
    mappedHeaders.add(header);
  }
  if (!mapping.contactName) {
    issues.push({ code: "MISSING_REQUIRED_HEADER", message: "Map a column to contactName.", severity: "error" });
  }
  return issues;
}

function mappedValue(row: RawImportRow, mapping: ImportMapping, key: ImportCanonicalColumn): string | null {
  const header = mapping[key];
  if (!header) return null;
  const value = row.values[header]?.trim();
  return value ? value : null;
}

export function mapImportRow(input: {
  row: RawImportRow;
  mapping: ImportMapping;
  defaultSource: string;
  defaultPhoneCountryCode?: string | null;
  jobId: string;
}): { payload: Record<string, unknown>; issues: ImportIssue[] } {
  const { row, mapping } = input;
  const sourceIdentifier = mappedValue(row, mapping, "sourceIdentifier") ?? `import:${input.jobId}:row:${row.rowNumber}`;
  const payload = {
    eventId: `import:${input.jobId}:row:${row.rowNumber}`,
    source: mappedValue(row, mapping, "source") ?? input.defaultSource,
    ...(mapping.acquisitionSource ? { acquisitionSource: mappedValue(row, mapping, "acquisitionSource") ?? undefined } : {}),
    sourceIdentifier,
    contactName: mappedValue(row, mapping, "contactName") ?? "",
    email: mappedValue(row, mapping, "email"),
    phone: mappedValue(row, mapping, "phone"),
    phoneCountryCode: mappedValue(row, mapping, "phoneCountryCode") ?? input.defaultPhoneCountryCode ?? null,
    companyName: mappedValue(row, mapping, "companyName"),
    sourceDetails: mappedValue(row, mapping, "sourceDetails"),
    status: mappedValue(row, mapping, "status") ?? "new",
    ownerId: mappedValue(row, mapping, "ownerId"),
    departmentId: mappedValue(row, mapping, "departmentId"),
    notes: mappedValue(row, mapping, "notes"),
    nextAction: mappedValue(row, mapping, "nextAction"),
    nextActionAt: mappedValue(row, mapping, "nextActionAt"),
  };
  const result = leadIntakeSchema.safeParse(payload);
  if (result.success) return { payload: result.data, issues: [] };
  return {
    payload,
    issues: result.error.issues.map((issue) => ({
      code: "ROW_INVALID",
      message: `${issue.path.join(".") || "row"}: ${issue.message}`,
      severity: "error" as const,
    })),
  };
}

export function addDuplicateWarnings(rows: Array<{ rowNumber: number; payload: Record<string, unknown>; issues: ImportIssue[] }>) {
  const seen = new Map<string, number>();
  for (const row of rows) {
    const sourceIdentifier = typeof row.payload.sourceIdentifier === "string" ? row.payload.sourceIdentifier.trim().toLowerCase() : "";
    const email = normalizeEmail(typeof row.payload.email === "string" ? row.payload.email : null);
    const phone = normalizePhone(
      typeof row.payload.phone === "string" ? row.payload.phone : null,
      typeof row.payload.phoneCountryCode === "string" ? row.payload.phoneCountryCode : null,
    );
    const keys = [
      sourceIdentifier ? `source:${sourceIdentifier}` : null,
      email ? `email:${email}` : null,
      phone ? `phone:${phone}` : null,
    ].filter((value): value is string => Boolean(value));
    for (const key of keys) {
      const previousRow = seen.get(key);
      if (previousRow) {
        row.issues.push({ code: "DUPLICATE_IN_FILE", message: `This row repeats an identity value from row ${previousRow}; it will still be sent through deduplication.`, severity: "warning" });
        break;
      }
      seen.set(key, row.rowNumber);
    }
  }
}
