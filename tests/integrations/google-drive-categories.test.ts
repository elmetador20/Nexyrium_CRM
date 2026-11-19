import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { driveFolderMappings, googleDriveConnections } from "@/db/schema";
import { checkFolderAccess, createConnectedDriveStorageAdapter } from "@/features/integrations/google-drive/connection";

const mock = vi.hoisted(() => ({
  get: vi.fn(), create: vi.fn(), select: vi.fn(), reserve: vi.fn(), complete: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ getGoogleDriveEnv: () => ({}) }));
vi.mock("@/lib/crypto/token-cipher", () => ({ decryptToken: () => "test-only" }));
vi.mock("googleapis", () => ({ google: {
  auth: { OAuth2: class { setCredentials() {} } },
  drive: () => ({ files: { get: mock.get, create: mock.create } }),
} }));
vi.mock("@/db", () => ({ db: { select: mock.select } }));
vi.mock("@/features/integrations/google-drive/upload-operations", () => ({ reserveUpload: mock.reserve }));

const connection = { id: "connection", folderId: "parent", folderVerifiedAt: new Date(), updatedAt: new Date() };
const body = Buffer.from("unit-test");
const upload = { filename: "test.txt", mimeType: "text/plain", body, operationKey: "record-version" };
const child = { id: "expense-folder", parents: ["parent"], mimeType: "application/vnd.google-apps.folder", capabilities: { canAddChildren: true } };
const stored = { id: "reserved", parents: ["expense-folder"], md5Checksum: createHash("md5").update(body).digest("hex") };

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("AUTH_GOOGLE_ID", "mock");
  vi.stubEnv("AUTH_GOOGLE_SECRET", "mock");
  mock.reserve.mockResolvedValue({ fileId: "reserved", complete: mock.complete });
  mock.select.mockImplementation(() => ({ from: (table: unknown) => ({ where: () => table === googleDriveConnections
    ? { orderBy: () => ({ limit: async () => [connection] }) }
    : Promise.resolve([]) }) }));
});

describe("Drive category routing", () => {
  it("reads a historical receipt by ID before folders are mapped", async () => {
    mock.get.mockResolvedValueOnce({ data: { id: "historical", parents: ["parent"] } }).mockResolvedValueOnce({ data: body });
    const file = await createConnectedDriveStorageAdapter().download("historical");
    expect(file.body).toEqual(body);
    expect(mock.reserve).not.toHaveBeenCalled();
    expect(mock.get.mock.calls.every(([args]) => args.fileId === "historical")).toBe(true);
  });

  it("rejects a writable folder outside the configured parent", async () => {
    mock.get.mockResolvedValue({ data: { ...child, parents: ["another-parent"] } });
    expect(await checkFolderAccess(connection as never, "expense-folder", "parent")).toEqual({ ok: false, reason: "outside_parent" });
  });

  it("a missing invoice destination leaves the Expense mapping usable", async () => {
    const adapter = createConnectedDriveStorageAdapter();
    await expect(adapter.upload({ ...upload, category: "invoice" })).rejects.toThrow("Invoice folder");
    mock.select.mockImplementationOnce(() => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => [connection] }) }) }) }))
      .mockImplementationOnce(() => ({ from: (table: unknown) => { expect(table).toBe(driveFolderMappings); return { where: async () => [{ folderId: "expense-folder" }] }; } }));
    mock.get.mockResolvedValue({ data: child });
    mock.create.mockResolvedValue({ data: stored });
    await adapter.upload({ ...upload, category: "expense" });
    expect(mock.create).toHaveBeenCalledWith(expect.objectContaining({ requestBody: expect.objectContaining({ id: "reserved", parents: ["expense-folder"] }) }));
  });
});
