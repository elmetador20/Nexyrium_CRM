import { beforeEach, describe, expect, it, vi } from "vitest";

import { checkReceiptMetadata, detectReceiptType, RECEIPT_MAX_BYTES, validateReceiptFile } from "@/features/accounting/receipt-file";
import { StorageError, type StorageAdapter } from "@/lib/storage";

const PDF = Buffer.from("%PDF-1.7\n%âãÏÓ\n1 0 obj");
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x24, 0, 0, 0]), Buffer.from("WEBPVP8 ")]);
const TEXT = Buffer.from("<html><script>alert(1)</script>");

describe("receipt file validation", () => {
  it("detects real file types from content", () => {
    expect(detectReceiptType(PDF)).toBe("application/pdf");
    expect(detectReceiptType(JPEG)).toBe("image/jpeg");
    expect(detectReceiptType(PNG)).toBe("image/png");
    expect(detectReceiptType(WEBP)).toBe("image/webp");
    expect(detectReceiptType(TEXT)).toBeNull();
  });

  it("rejects disguised, mismatched, empty and oversized files", () => {
    expect(validateReceiptFile({ type: "image/png", size: TEXT.length }, TEXT)).toMatchObject({ ok: false });
    expect(validateReceiptFile({ type: "image/png", size: PDF.length }, PDF)).toEqual({ ok: false, message: "The file content does not match its file type." });
    expect(validateReceiptFile({ type: "text/html", size: TEXT.length }, TEXT)).toMatchObject({ ok: false, message: "Receipts must be a PDF, JPEG, PNG or WebP file." });
    expect(checkReceiptMetadata({ type: "application/pdf", size: 0 })).toMatchObject({ ok: false });
    expect(checkReceiptMetadata({ type: "application/pdf", size: RECEIPT_MAX_BYTES + 1 })).toMatchObject({ ok: false, message: "Receipts must be 10 MB or smaller." });
    expect(validateReceiptFile({ type: "application/pdf", size: PDF.length }, PDF)).toEqual({ ok: true, mimeType: "application/pdf" });
    expect(validateReceiptFile({ type: "", size: WEBP.length }, WEBP)).toEqual({ ok: true, mimeType: "image/webp" });
  });
});

// --- Receipt service with mocked persistence and storage ---------------------------------

const getExpense = vi.fn();
const writes: string[] = [];
function chain(kind: string) {
  const row = [{ id: "doc-1", status: "available" }];
  const thenable = { returning: async () => row, then: (resolve: (value: unknown) => void) => resolve(undefined) };
  return {
    values: () => { writes.push(kind); return thenable; },
    set: () => ({ where: () => { writes.push(kind); return thenable; } }),
  };
}
const fakeDb = { insert: () => chain("insert"), update: () => chain("update") };
vi.mock("@/db", () => ({ db: { ...fakeDb, transaction: async (fn: (tx: typeof fakeDb) => unknown) => fn(fakeDb) } }));
vi.mock("@/features/accounting/queries", () => ({ getExpense: (...args: unknown[]) => getExpense(...args) }));

const { createExpenseReceiptService } = await import("@/features/accounting/services/receipt-service");

const actor = { userId: "11111111-1111-4111-8111-111111111111", email: "a@example.com", name: "A", isActive: true, roles: ["founder"], permissions: ["*"], departmentIds: [] };
const allowed = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const file = (body: Buffer, type: string, name = "receipt.pdf") => ({ name, type, size: body.length, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer });

function storage(overrides: Partial<StorageAdapter> = {}): StorageAdapter {
  return {
    provider: "google_drive",
    upload: vi.fn(async () => ({ provider: "google_drive" as const, objectId: "drive-file-1", parentId: "folder-1", filename: "receipt.pdf", mimeType: "application/pdf", sizeBytes: PDF.length, checksum: "md5", revision: "1", etag: null, metadata: { webViewLink: "https://drive.google.com/file/d/drive-file-1/view" } })),
    getMetadata: vi.fn(), download: vi.fn(), delete: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("expense receipt service", () => {
  beforeEach(() => {
    writes.length = 0;
    getExpense.mockResolvedValue({ expense: { status: "draft", ownerId: actor.userId, departmentId: null }, receipts: [] });
  });

  it("rejects a disguised file before creating any record or calling Drive", async () => {
    const adapter = storage();
    const service = createExpenseReceiptService({ storageFactory: () => adapter, maxFileBytes: 25_000_000, allowedMimeTypes: allowed });
    await expect(service.upload(actor, "exp-1", file(TEXT, "image/png", "fake.png"))).rejects.toMatchObject({ code: "INVALID" });
    expect(adapter.upload).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it("caps receipts at 10 MB even when the generic limit is higher", async () => {
    const service = createExpenseReceiptService({ storageFactory: () => storage(), maxFileBytes: 25_000_000, allowedMimeTypes: allowed });
    await expect(service.upload(actor, "exp-1", { ...file(PDF, "application/pdf"), size: RECEIPT_MAX_BYTES + 1 })).rejects.toMatchObject({ message: "Receipts must be 10 MB or smaller." });
  });

  it("uploads a valid PDF with the detected type and returns the Drive link and content URL", async () => {
    const adapter = storage();
    const service = createExpenseReceiptService({ storageFactory: () => adapter, maxFileBytes: 25_000_000, allowedMimeTypes: allowed });
    const result = await service.upload(actor, "exp-1", file(PDF, "application/pdf"));
    expect(adapter.upload).toHaveBeenCalledWith(expect.objectContaining({ mimeType: "application/pdf", filename: "receipt.pdf" }));
    expect(result).toMatchObject({ driveUrl: "https://drive.google.com/file/d/drive-file-1/view", contentUrl: "/api/v1/expenses/exp-1/receipts/doc-1/content" });
  });

  it("surfaces actionable Drive setup errors and records the failure", async () => {
    const adapter = storage({ upload: vi.fn(async () => { throw new StorageError("CONFIGURATION_MISSING", "Google Drive is not connected. An administrator can connect it in Settings → Integrations → Google Drive.", 503); }) });
    const service = createExpenseReceiptService({ storageFactory: () => adapter, maxFileBytes: 25_000_000, allowedMimeTypes: allowed });
    await expect(service.upload(actor, "exp-1", file(PDF, "application/pdf"))).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE", message: expect.stringContaining("not connected") });
    expect(writes).toContain("update"); // document marked failed, not deleted
  });

  it("does not let users attach receipts to approved expenses", async () => {
    getExpense.mockResolvedValue({ expense: { status: "approved", ownerId: actor.userId, departmentId: null }, receipts: [] });
    const service = createExpenseReceiptService({ storageFactory: () => storage(), maxFileBytes: 25_000_000, allowedMimeTypes: allowed });
    await expect(service.upload(actor, "exp-1", file(PDF, "application/pdf"))).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
