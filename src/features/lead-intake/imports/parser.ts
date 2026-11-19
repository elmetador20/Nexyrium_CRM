import { createHash } from "node:crypto";
import * as XLSX from "xlsx";

import { LeadImportError } from "./errors";
import type { ImportPreview, RawImportRow } from "./types";

export type ParsedImportFile = ImportPreview & {
  format: "csv" | "xlsx";
  filename: string;
  fileSize: number;
  fileHash: string;
  rows: RawImportRow[];
};

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function detectFormat(filename: string, contentType: string | undefined): "csv" | "xlsx" {
  const extension = filename.toLowerCase().split(".").pop();
  const mime = contentType?.split(";", 1)[0]?.trim().toLowerCase();
  const csvMime = !mime || new Set(["text/csv", "application/csv", "text/plain", "application/vnd.ms-excel", "application/octet-stream"]).has(mime);
  const xlsxMime = !mime || new Set(["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream"]).has(mime);
  if (extension === "csv" && csvMime) return "csv";
  if (extension === "xlsx" && (xlsxMime || !contentType)) return "xlsx";
  throw new LeadImportError("UNSUPPORTED_FILE_TYPE", "Only .csv and .xlsx lead files are supported.");
}

function cellToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

export async function parseLeadImportFile(input: {
  file: File;
  maxBytes: number;
  maxRows: number;
  previewRows: number;
}): Promise<ParsedImportFile> {
  const filename = input.file.name.trim();
  if (!filename) throw new LeadImportError("FILE_REQUIRED", "A file is required.");
  if (input.file.size === 0) throw new LeadImportError("EMPTY_FILE", "The uploaded file is empty.");
  if (input.file.size > input.maxBytes) {
    throw new LeadImportError("FILE_TOO_LARGE", `The file is larger than the ${input.maxBytes.toLocaleString()} byte limit.`);
  }

  const format = detectFormat(filename, input.file.type);
  const buffer = Buffer.from(await input.file.arrayBuffer());
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, raw: false });
  } catch {
    throw new LeadImportError("INVALID_WORKBOOK", "The uploaded file could not be parsed as a CSV or XLSX workbook.");
  }

  const worksheetName = workbook.SheetNames[0];
  const worksheet = worksheetName ? workbook.Sheets[worksheetName] : undefined;
  if (!worksheet) throw new LeadImportError("EMPTY_FILE", "The workbook has no worksheet data.");

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: "", raw: false, blankrows: false });
  const firstRow = matrix[0]?.map(cellToText) ?? [];
  const headers = firstRow.map((header) => header.replace(/^\uFEFF/, "").trim());
  if (!headers.length || headers.every((header) => !header)) {
    throw new LeadImportError("MISSING_REQUIRED_HEADER", "The file must contain a header row.");
  }

  const seenHeaders = new Set<string>();
  for (const header of headers) {
    const normalized = normalizeHeader(header);
    if (!normalized) continue;
    if (seenHeaders.has(normalized)) throw new LeadImportError("DUPLICATE_HEADER", `The header "${header}" appears more than once.`);
    seenHeaders.add(normalized);
  }

  const rows = matrix.slice(1).map((cells, index) => ({
    rowNumber: index + 2,
    values: Object.fromEntries(headers.map((header, columnIndex) => [header, cellToText(cells[columnIndex])])),
  })).filter((row) => Object.values(row.values).some(Boolean));

  if (rows.length > input.maxRows) {
    throw new LeadImportError("TOO_MANY_ROWS", `The file contains ${rows.length.toLocaleString()} rows; the limit is ${input.maxRows.toLocaleString()}.`);
  }

  const suggestedMapping = suggestMapping(headers);
  return {
    format,
    filename,
    fileSize: input.file.size,
    fileHash: hashBuffer(buffer),
    headers,
    worksheetName: worksheetName ?? null,
    suggestedMapping,
    sampleRows: rows.slice(0, input.previewRows),
    totalRows: rows.length,
    rows,
  };
}

function hashBuffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

const aliases: Record<string, string[]> = {
  contactName: ["contactname", "contact name", "name", "full name", "fullname"],
  email: ["email", "email address", "emailaddress"],
  phone: ["phone", "phone number", "phonenumber", "mobile", "mobile number"],
  phoneCountryCode: ["phonecountrycode", "phone country code", "country code", "countrycode"],
  companyName: ["company", "company name", "companyname", "business"],
  sourceIdentifier: ["source id", "source identifier", "sourceidentifier", "provider id", "providerid", "lead id", "leadid"],
  sourceDetails: ["source details", "sourcedetails"],
  source: ["ingestion", "ingestion source"],
  acquisitionSource: ["source", "lead source", "acquisition source", "acquisitionsource"],
  status: ["status", "lead status"],
  ownerId: ["owner id", "ownerid"],
  departmentId: ["department id", "departmentid"],
  notes: ["notes", "note"],
  nextAction: ["next action", "nextaction", "follow up", "follow-up"],
  nextActionAt: ["next action at", "nextactionat", "follow-up date", "follow up date", "followupdate"],
};

function suggestMapping(headers: string[]) {
  const mapping: Record<string, string> = {};
  for (const [canonical, candidates] of Object.entries(aliases)) {
    const match = headers.find((header) => {
      const normalized = normalizeHeader(header);
      return candidates.some((candidate) => normalizeHeader(candidate) === normalized);
    });
    if (match) mapping[canonical] = match;
  }
  return mapping;
}
