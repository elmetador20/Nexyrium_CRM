import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { parseLeadImportFile } from "@/features/lead-intake/imports/parser";
import { addDuplicateWarnings, mapImportRow, validateMapping } from "@/features/lead-intake/imports/mapping";
import { createLeadImportService } from "@/features/lead-intake/imports/service";
import type { ImportRepository } from "@/features/lead-intake/imports/queries";
import type { LeadImportJob, LeadImportRow } from "@/db/schema";
import type { AuthorizationActor } from "@/lib/authorization/policy";
import { ROLE_SLUGS } from "@/lib/authorization/roles";

describe("lead imports", () => {
  it("parses CSV headers, quoted values, and row numbers for preview", async () => {
    const file = new File(["contactName,email,notes\n\"Ada Lovelace\",ada@example.com,\"Called, interested\"\n"], "leads.csv", { type: "text/csv" });
    const parsed = await parseLeadImportFile({ file, maxBytes: 100_000, maxRows: 10, previewRows: 5 });

    expect(parsed.format).toBe("csv");
    expect(parsed.headers).toEqual(["contactName", "email", "notes"]);
    expect(parsed.rows[0]).toMatchObject({ rowNumber: 2, values: { contactName: "Ada Lovelace", notes: "Called, interested" } });
    expect(parsed.suggestedMapping.contactName).toBe("contactName");
  });

  it("parses XLSX worksheets and accepts files with a browser-provided workbook MIME type", async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Name", "Email"],
      ["Grace Hopper", "grace@example.com"],
    ]), "Leads");
    const file = new File([XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })], "leads.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

    const parsed = await parseLeadImportFile({ file, maxBytes: 100_000, maxRows: 10, previewRows: 5 });

    expect(parsed.format).toBe("xlsx");
    expect(parsed.worksheetName).toBe("Leads");
    expect(parsed.rows).toEqual([{ rowNumber: 2, values: { Name: "Grace Hopper", Email: "grace@example.com" } }]);
    expect(parsed.suggestedMapping).toEqual({ contactName: "Name", email: "Email" });
  });

  it("requires contactName and reports invalid mapped rows without dropping them", () => {
    const mappingIssues = validateMapping(["email"], { email: "email" });
    expect(mappingIssues.some((issue) => issue.code === "MISSING_REQUIRED_HEADER")).toBe(true);

    const mapped = mapImportRow({ row: { rowNumber: 4, values: { email: "not-an-email" } }, mapping: { contactName: "email", email: "email" }, defaultSource: "csv_import", jobId: "job-1" });
    expect(mapped.payload.eventId).toBe("import:job-1:row:4");
    expect(mapped.issues.some((issue) => issue.severity === "error")).toBe(true);
  });

  it("marks repeated identity values as warnings for transparent deduplication", () => {
    const rows = [
      { rowNumber: 2, ...mapImportRow({ row: { rowNumber: 2, values: { contactName: "Ada", email: "ada@example.com", phone: "+15550101234" } }, mapping: { contactName: "contactName", email: "email", phone: "phone" }, defaultSource: "csv_import", jobId: "job-1" }) },
      { rowNumber: 3, ...mapImportRow({ row: { rowNumber: 3, values: { contactName: "Ada Again", email: "ADA@example.com", phone: "(555) 010-1234", phoneCountryCode: "+1" } }, mapping: { contactName: "contactName", email: "email", phone: "phone", phoneCountryCode: "phoneCountryCode" }, defaultSource: "csv_import", jobId: "job-1" }) },
    ];
    addDuplicateWarnings(rows);
    expect(rows[1].issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "DUPLICATE_IN_FILE", message: expect.stringContaining("row 2"), severity: "warning" })]));
  });

  it("routes valid rows through intake and retries only failed rows", async () => {
    const actor: AuthorizationActor = { userId: "importer", email: "importer@example.com", name: "Importer", isActive: true, roles: [ROLE_SLUGS.OWNER_ADMIN], permissions: ["*"], departmentIds: [] };
    let job: LeadImportJob | null = null;
    const rows: LeadImportRow[] = [];
    const repository: ImportRepository = {
      async createJob(input) { job = { id: "job-1", createdAt: new Date(), updatedAt: new Date(), startedAt: null, completedAt: null, ...input } as LeadImportJob; return job; },
      async createRows(input) { const created = input.map((value, index) => ({ id: `row-${index + 1}`, createdAt: new Date(), updatedAt: new Date(), processedAt: null, intakeEventId: null, leadId: null, outcome: null, errorCode: null, errorMessage: null, ...value } as LeadImportRow)); rows.push(...created); return created; },
      async findJob() { if (!job) return null; return job; },
      async claimJob(input) { if (!job || !input.statuses.includes(job.status)) return false; job = { ...job, status: "processing", startedAt: input.startedAt, completedAt: null, updatedAt: new Date() } as LeadImportJob; return true; },
      async listRows() { return rows; },
      async updateJob(_id, input) { if (!job) throw new Error("job missing"); job = { ...job, ...input, updatedAt: new Date() } as LeadImportJob; },
      async updateRow(id, input) { const row = rows.find((candidate) => candidate.id === id); if (!row) throw new Error("row missing"); Object.assign(row, input, { updatedAt: new Date() }); return row; },
    };
    let intakeCalls = 0;
    const service = createLeadImportService({
      repository,
      intake: { async ingest() { intakeCalls += 1; if (intakeCalls === 2) throw new Error("temporary failure"); return { eventId: `intake-${intakeCalls}`, outcome: "created" as const, leadId: `lead-${intakeCalls}` }; } },
      limits: { maxBytes: 10_000, maxRows: 10, previewRows: 5 },
    });
    const parsed = { format: "csv" as const, filename: "leads.csv", fileSize: 100, fileHash: "hash", headers: ["contactName", "email"], worksheetName: null, suggestedMapping: { contactName: "contactName", email: "email" }, sampleRows: [], totalRows: 2, rows: [{ rowNumber: 2, values: { contactName: "Ada", email: "ada@example.com" } }, { rowNumber: 3, values: { contactName: "Grace", email: "grace@example.com" } }] };

    const created = await service.createJob({ actor, parsed, mapping: parsed.suggestedMapping, source: "csv_import" });
    expect(created?.validRows).toBe(2);
    const firstRun = await service.process(actor, "job-1", false);
    expect(firstRun).toMatchObject({ status: "completed_with_errors", createdCount: 1, failedCount: 1 });
    const retry = await service.process(actor, "job-1", true);
    expect(retry).toMatchObject({ status: "completed", createdCount: 2, failedCount: 0 });
    expect(intakeCalls).toBe(3);
    const safeRetry = await service.process(actor, "job-1", true);
    expect(safeRetry).toMatchObject({ status: "completed", createdCount: 2, failedCount: 0 });
    expect(intakeCalls).toBe(3);
  });

  it("persists invalid rows, reports counts, and exports invalid/failed rows", async () => {
    const actor: AuthorizationActor = { userId: "importer", email: "importer@example.com", name: "Importer", isActive: true, roles: [ROLE_SLUGS.OWNER_ADMIN], permissions: ["*"], departmentIds: [] };
    let job: LeadImportJob | null = null;
    const rows: LeadImportRow[] = [];
    const repository: ImportRepository = {
      async createJob(input) { job = { id: "job-2", createdAt: new Date(), updatedAt: new Date(), startedAt: null, completedAt: null, ...input } as LeadImportJob; return job; },
      async createRows(input) { const created = input.map((value, index) => ({ id: `row-${index + 1}`, createdAt: new Date(), updatedAt: new Date(), processedAt: null, intakeEventId: null, leadId: null, outcome: null, errorCode: null, errorMessage: null, ...value } as LeadImportRow)); rows.push(...created); return created; },
      async findJob() { return job; },
      async claimJob(input) { if (!job || !input.statuses.includes(job.status)) return false; job = { ...job, status: "processing", startedAt: input.startedAt, completedAt: null, updatedAt: new Date() } as LeadImportJob; return true; },
      async listRows() { return rows; },
      async updateJob(_id, input) { if (!job) throw new Error("job missing"); job = { ...job, ...input, updatedAt: new Date() } as LeadImportJob; },
      async updateRow(id, input) { const row = rows.find((candidate) => candidate.id === id); if (!row) throw new Error("row missing"); Object.assign(row, input, { updatedAt: new Date() }); return row; },
    };
    const service = createLeadImportService({
      repository,
      intake: { async ingest() { return { eventId: "intake-created", outcome: "created" as const, leadId: "lead-created" }; } },
      limits: { maxBytes: 10_000, maxRows: 10, previewRows: 5 },
    });
    const parsed = { format: "csv" as const, filename: "leads.csv", fileSize: 100, fileHash: "hash-2", headers: ["contactName", "email"], worksheetName: null, suggestedMapping: { contactName: "contactName", email: "email" }, sampleRows: [], totalRows: 2, rows: [{ rowNumber: 2, values: { contactName: "Ada", email: "ada@example.com" } }, { rowNumber: 3, values: { contactName: "", email: "bad" } }] };

    const created = await service.createJob({ actor, parsed, mapping: parsed.suggestedMapping, source: "csv_import" });
    expect(created).toMatchObject({ totalRows: 2, validRows: 1, invalidRows: 1, createdCount: 0 });
    expect(await service.getRows(actor, "job-2")).toEqual(expect.arrayContaining([expect.objectContaining({ rowNumber: 3, status: "invalid" })]));

    const result = await service.process(actor, "job-2", false);
    expect(result).toMatchObject({ status: "completed_with_errors", totalRows: 2, validRows: 1, invalidRows: 1, createdCount: 1, failedCount: 0 });
    const errorExport = await service.exportErrors(actor, "job-2");
    expect(errorExport.content).toContain("rowNumber,importStatus,errorCode");
    expect(errorExport.content).toContain("3,invalid");
    expect(errorExport.content).toContain("ROW_INVALID");
  });

  it("sanitizes formula-looking values in error exports", async () => {
    const actor: AuthorizationActor = { userId: "importer", email: "importer@example.com", name: "Importer", isActive: true, roles: [ROLE_SLUGS.OWNER_ADMIN], permissions: ["*"], departmentIds: [] };
    const rows: LeadImportRow[] = [{
      id: "row-formula",
      jobId: "job-formula",
      rowNumber: 2,
      idempotencyKey: "row-formula",
      payload: { contactName: "=HYPERLINK(\"https://example.com\")" },
      validationIssues: [],
      status: "invalid",
      intakeEventId: null,
      leadId: null,
      outcome: null,
      errorCode: "ROW_INVALID",
      errorMessage: "Invalid row",
      processedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }];
    const job: LeadImportJob = { id: "job-formula", createdAt: new Date(), updatedAt: new Date(), startedAt: null, completedAt: null, createdByUserId: actor.userId, departmentId: null, filename: "leads.csv", format: "csv", fileSize: 10, fileHash: "hash", worksheetName: null, source: "csv_import", sourceMetadata: {}, columnMapping: {}, status: "validated", totalRows: 1, validRows: 0, invalidRows: 1, createdCount: 0, linkedCount: 0, needsReviewCount: 0, failedCount: 0, errorSummary: [], };
    const service = createLeadImportService({
      repository: {
        async createJob() { return job; }, async createRows() { return rows; }, async findJob() { return job; }, async claimJob() { return false; }, async listRows() { return rows; }, async updateJob() {}, async updateRow() { return rows[0]!; },
      },
      intake: { async ingest() { throw new Error("not used"); } },
      limits: { maxBytes: 10_000, maxRows: 10, previewRows: 5 },
    });
    const exported = await service.exportErrors(actor, job.id);
    expect(exported.content).toContain("'=HYPERLINK");
    expect(exported.content).not.toContain(",=HYPERLINK");
  });

  it("marks assignment rows invalid before commit when the actor lacks scope", async () => {
    const actor: AuthorizationActor = { userId: "11111111-1111-4111-8111-111111111111", email: "sales@example.com", name: "Sales", isActive: true, roles: [ROLE_SLUGS.SALES], permissions: ["crm:leads:create"], departmentIds: ["22222222-2222-4222-8222-222222222222"] };
    let job: LeadImportJob | null = null;
    const rows: LeadImportRow[] = [];
    const repository: ImportRepository = {
      async createJob(input) { job = { id: "job-3", createdAt: new Date(), updatedAt: new Date(), startedAt: null, completedAt: null, ...input } as LeadImportJob; return job; },
      async createRows(input) { const created = input.map((value) => ({ id: "row-1", createdAt: new Date(), updatedAt: new Date(), processedAt: null, intakeEventId: null, leadId: null, outcome: null, errorCode: null, errorMessage: null, ...value } as LeadImportRow)); rows.push(...created); return created; },
      async findJob() { return job; },
      async claimJob() { return false; },
      async listRows() { return rows; },
      async updateJob(_id, input) { if (job) job = { ...job, ...input } as LeadImportJob; },
      async updateRow(id, input) { const row = rows.find((candidate) => candidate.id === id); if (!row) throw new Error("row missing"); Object.assign(row, input); return row; },
    };
    const service = createLeadImportService({ repository, intake: { async ingest() { throw new Error("should not run"); } }, limits: { maxBytes: 10_000, maxRows: 10, previewRows: 5 } });
    const parsed = { format: "csv" as const, filename: "leads.csv", fileSize: 100, fileHash: "hash-3", headers: ["contactName", "ownerId"], worksheetName: null, suggestedMapping: { contactName: "contactName", ownerId: "ownerId" }, sampleRows: [], totalRows: 1, rows: [{ rowNumber: 2, values: { contactName: "Ada", ownerId: "33333333-3333-4333-8333-333333333333" } }] };

    const created = await service.createJob({ actor, parsed, mapping: parsed.suggestedMapping, source: "csv_import" });
    expect(created).toMatchObject({ validRows: 0, invalidRows: 1 });
    expect(rows[0]?.validationIssues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "ROW_FORBIDDEN" })]));
  });
});
