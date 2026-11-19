import { getCrmScope } from "@/features/crm/shared/types";
import { resolveCrmAssignment } from "@/features/crm/shared/service";
import type { LeadImportJob, LeadImportRow } from "@/db/schema";
import type { AuthorizationActor } from "@/lib/authorization/policy";

import type { LeadIntakeResult } from "../services";
import { LeadImportError } from "./errors";
import { addDuplicateWarnings, mapImportRow, parseMapping, validateMapping } from "./mapping";
import type { ImportRepository } from "./queries";
import { parseLeadImportFile, type ParsedImportFile } from "./parser";
import type { ImportIssue, ImportJobSummary, ImportMapping, ImportPreview, ImportRowSummary } from "./types";

type IntakeService = {
  ingest(actor: AuthorizationActor, rawInput: unknown, correlationId?: string): Promise<LeadIntakeResult>;
};

type ImportServiceDependencies = {
  repository: ImportRepository;
  intake: IntakeService;
  createJobTransaction?: <T>(work: (repository: ImportRepository) => Promise<T>) => Promise<T>;
  limits: { maxBytes: number; maxRows: number; previewRows: number };
};

export function summarizeJob(job: LeadImportJob | ImportJobSummary): ImportJobSummary {
  return {
    id: job.id,
    filename: job.filename,
    format: job.format,
    fileSize: job.fileSize,
    source: job.source,
    status: job.status,
    totalRows: job.totalRows,
    validRows: job.validRows,
    invalidRows: job.invalidRows,
    createdCount: job.createdCount,
    linkedCount: job.linkedCount,
    needsReviewCount: job.needsReviewCount,
    failedCount: job.failedCount,
    errorSummary: job.errorSummary,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
  };
}

export function summarizeRow(row: LeadImportRow): ImportRowSummary {
  return {
    id: row.id,
    rowNumber: row.rowNumber,
    validationIssues: row.validationIssues,
    status: row.status,
    intakeEventId: row.intakeEventId,
    leadId: row.leadId,
    outcome: row.outcome,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    processedAt: row.processedAt,
  };
}

export function createLeadImportService({ repository, intake, createJobTransaction, limits }: ImportServiceDependencies) {
  async function parse(file: File): Promise<ParsedImportFile> {
    return parseLeadImportFile({ file, maxBytes: limits.maxBytes, maxRows: limits.maxRows, previewRows: limits.previewRows });
  }

  function preview(parsed: ParsedImportFile): ImportPreview {
    return {
      headers: parsed.headers,
      worksheetName: parsed.worksheetName,
      suggestedMapping: parsed.suggestedMapping,
      sampleRows: parsed.sampleRows,
      totalRows: parsed.totalRows,
    };
  }

  async function createJob(input: {
    actor: AuthorizationActor;
    parsed: ParsedImportFile;
    mapping: ImportMapping;
    source: string;
    phoneCountryCode?: string | null;
  }) {
    const mappingIssues = validateMapping(input.parsed.headers, input.mapping);
    if (mappingIssues.some((issue) => issue.severity === "error")) {
      throw new LeadImportError("MISSING_REQUIRED_HEADER", mappingIssues.map((issue) => issue.message).join(" "));
    }
    const transaction = createJobTransaction ?? (async <T>(work: (repository: ImportRepository) => Promise<T>) => work(repository));
    return transaction(async (tx) => {
      const job = await tx.createJob({
        createdByUserId: input.actor.userId,
        departmentId: input.actor.departmentIds[0] ?? null,
        filename: input.parsed.filename,
        format: input.parsed.format,
        fileSize: input.parsed.fileSize,
        fileHash: input.parsed.fileHash,
        worksheetName: input.parsed.worksheetName,
        source: input.source,
        sourceMetadata: {
          importType: input.parsed.format,
          originalFilename: input.parsed.filename,
          worksheetName: input.parsed.worksheetName,
          headerCount: input.parsed.headers.length,
        },
        columnMapping: input.mapping,
        status: "validated",
        totalRows: input.parsed.totalRows,
        validRows: 0,
        invalidRows: 0,
        createdCount: 0,
        linkedCount: 0,
        needsReviewCount: 0,
        failedCount: 0,
        errorSummary: [],
      });

      const rowsWithJobId = input.parsed.rows.map((row) => ({
        row,
        rowNumber: row.rowNumber,
        ...mapImportRow({ row, mapping: input.mapping, defaultSource: input.source, defaultPhoneCountryCode: input.phoneCountryCode, jobId: job.id }),
      }));
      for (const row of rowsWithJobId) {
        if (row.issues.some((issue) => issue.severity === "error")) continue;
        try {
          resolveCrmAssignment(
            input.actor,
            typeof row.payload.ownerId === "string" ? row.payload.ownerId : null,
            typeof row.payload.departmentId === "string" ? row.payload.departmentId : null,
          );
        } catch (error) {
          row.issues.push({
            code: "ROW_FORBIDDEN",
            message: error instanceof Error ? error.message : "You cannot assign this row to the selected owner or department.",
            severity: "error",
          });
        }
      }
      addDuplicateWarnings(rowsWithJobId);
      const rowValues = rowsWithJobId.map(({ row, payload, issues }) => ({
        jobId: job.id,
        rowNumber: row.rowNumber,
        idempotencyKey: String(payload.eventId),
        payload,
        validationIssues: issues,
        status: issues.some((issue) => issue.severity === "error") ? "invalid" as const : "valid" as const,
      }));
      await tx.createRows(rowValues);
      const invalidRows = rowValues.filter((row) => row.status === "invalid").length;
      const errorSummary = countIssues(rowValues.flatMap((row) => row.validationIssues).filter((issue) => issue.severity === "error"));
      await tx.updateJob(job.id, {
        validRows: rowValues.length - invalidRows,
        invalidRows,
        status: "validated",
        errorSummary,
      });
      const savedJob = await tx.findJob(job.id, getCrmScope(input.actor));
      return savedJob ? summarizeJob(savedJob) : null;
    });
  }

  async function getJob(actor: AuthorizationActor, jobId: string) {
    const job = await repository.findJob(jobId, getCrmScope(actor));
    if (!job) throw new LeadImportError("IMPORT_NOT_FOUND", "Import job not found.");
    return summarizeJob(job);
  }

  async function getRows(actor: AuthorizationActor, jobId: string) {
    await getJob(actor, jobId);
    return (await repository.listRows(jobId)).map(summarizeRow);
  }

  async function process(actor: AuthorizationActor, jobId: string, retryFailed: boolean): Promise<ImportJobSummary> {
    const job = await getJob(actor, jobId);
    if (job.status === "processing") throw new LeadImportError("IMPORT_IN_PROGRESS", "This import is already processing.");
    if (job.status === "completed") return job;
    if (!retryFailed && job.status === "completed_with_errors") return job;
    if (retryFailed && (job.status === "completed_with_errors" || job.status === "failed") && job.failedCount === 0) return job;

    const scope = getCrmScope(actor);
    const claimed = await repository.claimJob({
      id: job.id,
      scope,
      statuses: retryFailed ? ["completed_with_errors", "failed"] : ["validated"],
      startedAt: job.startedAt ?? new Date(),
    });
    if (!claimed) {
      const current = await getJob(actor, job.id);
      if (current.status === "processing") throw new LeadImportError("IMPORT_IN_PROGRESS", "This import is already processing.");
      if (current.status === "completed" || (!retryFailed && current.status === "completed_with_errors") || (retryFailed && current.failedCount === 0)) return current;
      throw new LeadImportError("IMPORT_NOT_READY", "This import is not ready for the requested operation.");
    }

    const rows = await repository.listRows(job.id);
    const eligible = rows.filter((row) => retryFailed ? row.status === "failed" : row.status === "valid");

    for (const row of eligible) {
      await repository.updateRow(row.id, { status: "processing", errorCode: null, errorMessage: null, processedAt: null });
      try {
        const result = await intake.ingest(actor, row.payload, `import:${job.id}:row:${row.rowNumber}`);
        await repository.updateRow(row.id, {
          status: result.outcome,
          intakeEventId: result.eventId,
          leadId: result.leadId ?? null,
          outcome: result.outcome,
          processedAt: new Date(),
        });
      } catch (error) {
        const code = typeof error === "object" && error && "code" in error && typeof error.code === "string" ? error.code : "INTAKE_FAILED";
        await repository.updateRow(row.id, {
          status: "failed",
          errorCode: code,
          errorMessage: error instanceof Error ? error.message : "The row could not be imported.",
          processedAt: new Date(),
        });
      }
    }

    const updatedRows = await repository.listRows(job.id);
    const updatedJob = {
      status: updatedRows.some((row) => row.status === "failed" || row.status === "invalid") ? "completed_with_errors" as const : "completed" as const,
      totalRows: updatedRows.length,
      validRows: updatedRows.filter((row) => row.status !== "invalid").length,
      invalidRows: updatedRows.filter((row) => row.status === "invalid").length,
      createdCount: updatedRows.filter((row) => row.status === "created").length,
      linkedCount: updatedRows.filter((row) => row.status === "linked_existing").length,
      needsReviewCount: updatedRows.filter((row) => row.status === "needs_review").length,
      failedCount: updatedRows.filter((row) => row.status === "failed").length,
      errorSummary: countIssues(updatedRows.flatMap((row) => row.validationIssues).filter((issue) => issue.severity === "error")).concat(
        countIssues(updatedRows.filter((row) => row.errorCode).map((row) => ({ code: row.errorCode!, message: row.errorMessage ?? "", severity: "error" as const }))),
      ),
      completedAt: new Date(),
    };
    await repository.updateJob(job.id, updatedJob);
    const finalJob = await repository.findJob(job.id, getCrmScope(actor));
    if (!finalJob) throw new LeadImportError("IMPORT_NOT_FOUND", "Import job disappeared while processing.");
    return summarizeJob(finalJob);
  }

  async function exportErrors(actor: AuthorizationActor, jobId: string): Promise<{ filename: string; content: string }> {
    const job = await getJob(actor, jobId);
    const rows = await repository.listRows(job.id);
    return {
      filename: `lead-import-${job.id}-errors.csv`,
      content: errorRowsCsv(rows),
    };
  }

  return { parse, preview, createJob, getJob, getRows, process, exportErrors };
}

function countIssues(issues: ImportIssue[]): Array<{ code: string; count: number }> {
  const counts = new Map<string, number>();
  for (const issue of issues) counts.set(issue.code, (counts.get(issue.code) ?? 0) + 1);
  return [...counts.entries()].map(([code, count]) => ({ code, count }));
}

export function csvTemplate(): string {
  return [
    "contactName,email,phone,phoneCountryCode,companyName,sourceIdentifier,sourceDetails,ingestion,source,status,ownerId,departmentId,notes,nextAction,nextActionAt",
    "Ada Lovelace,ada@example.com,+15550101234,+1,Analytical Engines,example-provider-id,Referral partner,import,partner,new,,,Call prospect,2026-01-15T15:00:00.000Z",
  ].join("\n");
}

export function parseMappingInput(value: unknown): ImportMapping {
  return parseMapping(value);
}

const errorExportColumns = [
  "rowNumber",
  "importStatus",
  "errorCode",
  "errorMessage",
  "validationIssues",
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

function csvCell(value: unknown): string {
  const rawText = value === null || value === undefined
    ? ""
    : typeof value === "string"
      ? value
      : JSON.stringify(value) ?? String(value);
  // Prefix spreadsheet formula-looking values so downloading an error report
  // cannot turn imported data into an executable formula in Excel or Sheets.
  const text = /^[=+\-@]/.test(rawText) ? `'${rawText}` : rawText;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function errorRowsCsv(rows: LeadImportRow[]): string {
  const errorRows = rows.filter((row) => row.status === "invalid" || row.status === "failed");
  const lines = [errorExportColumns.join(",")];
  for (const row of errorRows) {
    const payload = row.payload;
    const values: Record<string, unknown> = {
      rowNumber: row.rowNumber,
      importStatus: row.status,
      errorCode: row.errorCode,
      errorMessage: row.errorMessage,
      validationIssues: row.validationIssues,
      ...payload,
    };
    lines.push(errorExportColumns.map((column) => csvCell(values[column])).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}
