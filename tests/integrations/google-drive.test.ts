import { describe, expect, it, vi } from "vitest";

import { createGoogleDriveStorageAdapter, providerError } from "@/features/integrations/google-drive/adapter";

describe("Google Drive OAuth adapter", () => {
  it("resolves the authenticated Drive client lazily and uploads into the verified folder", async () => {
    const files = { create: vi.fn(async () => ({ data: { id: "f-1", name: "r.pdf", mimeType: "application/pdf", size: "4", webViewLink: "https://drive.google.com/file/d/f-1/view" } })), get: vi.fn(), delete: vi.fn() };
    const resolve = vi.fn(async () => ({ drive: { files } as never, folderId: "receipts-folder" }));
    const adapter = createGoogleDriveStorageAdapter({ resolve });
    expect(resolve).not.toHaveBeenCalled();
    const uploaded = await adapter.upload({ filename: "r.pdf", mimeType: "application/pdf", body: Buffer.from("%PDF") });
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(files.create).toHaveBeenCalledWith(expect.objectContaining({ requestBody: expect.objectContaining({ parents: ["receipts-folder"] }) }));
    expect(uploaded).toMatchObject({ objectId: "f-1", parentId: "receipts-folder", metadata: { webViewLink: "https://drive.google.com/file/d/f-1/view" } });
  });

  it("treats a revoked grant as an authentication failure and notifies the connection layer", async () => {
    const files = { create: vi.fn(async () => { throw Object.assign(new Error("invalid_grant"), { response: { status: 400, data: { error: "invalid_grant", error_description: "Token has been expired or revoked." } } }); }), get: vi.fn(), delete: vi.fn() };
    const onAuthFailure = vi.fn(async () => undefined);
    const adapter = createGoogleDriveStorageAdapter({ resolve: async () => ({ drive: { files } as never, folderId: "f" }), onAuthFailure });
    const failure = adapter.upload({ filename: "r.pdf", mimeType: "application/pdf", body: Buffer.from("%PDF") });
    await expect(failure).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED", message: expect.stringContaining("Reconnect Google Drive") });
    expect(onAuthFailure).toHaveBeenCalledTimes(1);
  });

  it("maps provider errors without exposing provider details", () => {
    const notFound = providerError({ response: { status: 404, data: { error: { message: "File not found: secret-folder-id" } } } }, "upload");
    expect(notFound.code).toBe("NOT_FOUND");
    expect(notFound.message).not.toContain("secret-folder-id");
    expect(providerError({ response: { status: 403 } }, "upload").code).toBe("ACCESS_DENIED");
    expect(providerError({ response: { status: 429 } }, "upload").code).toBe("QUOTA_EXCEEDED");
  });

  it("propagates configuration errors raised while resolving the connection unchanged", async () => {
    const { StorageError } = await import("@/lib/storage");
    const adapter = createGoogleDriveStorageAdapter({ resolve: async () => { throw new StorageError("ACCESS_DENIED", "The receipts folder has not been authorized yet.", 503); } });
    await expect(adapter.upload({ filename: "r.pdf", mimeType: "application/pdf", body: Buffer.from("x") })).rejects.toMatchObject({ code: "ACCESS_DENIED", status: 503 });
  });
});

describe("Drive scope detection", async () => {
  vi.mock("server-only", () => ({}));
  vi.mock("@/db", () => ({ db: {} }));
  const { hasDriveScope } = await import("@/features/integrations/google-drive/connection");
  it("only stores a token when Google actually granted drive.file", () => {
    expect(hasDriveScope("openid email profile https://www.googleapis.com/auth/drive.file")).toBe(true);
    expect(hasDriveScope("openid email profile")).toBe(false);
    expect(hasDriveScope("https://www.googleapis.com/auth/drive.file.extra")).toBe(false);
    expect(hasDriveScope(undefined)).toBe(false);
  });
});

describe("Drive v3 request shape (regression: uploads rejected with 'Invalid field selection etag')", () => {
  const V3_FILE_FIELDS = new Set(["id", "name", "mimeType", "size", "md5Checksum", "version", "webViewLink", "createdTime", "modifiedTime", "parents", "trashed", "capabilities"]);
  it("requests only fields that exist on the Drive v3 File resource", async () => {
    const files = { create: vi.fn(async () => ({ data: { id: "f-1", name: "r.pdf", mimeType: "application/pdf", size: "4" } })), get: vi.fn(async () => ({ data: { id: "f-1", name: "r.pdf", mimeType: "application/pdf", size: "4" } })), delete: vi.fn() };
    const adapter = createGoogleDriveStorageAdapter({ resolve: async () => ({ drive: { files } as never, folderId: "folder" }) });
    await adapter.upload({ filename: "r.pdf", mimeType: "application/pdf", body: Buffer.from("%PDF") });
    await adapter.getMetadata("f-1");
    const requested = [...files.create.mock.calls, ...files.get.mock.calls].map((call) => String((call as unknown as [{ fields: string }])[0].fields));
    for (const fields of requested) {
      for (const field of fields.split(",")) expect(V3_FILE_FIELDS.has(field.replace(/\(.*$/, "").trim())).toBe(true);
      expect(fields).not.toMatch(/\betag\b/);
    }
  });

  it("keeps Google's status and reason code for diagnostics, but no message text", () => {
    const error = providerError({ response: { status: 400, data: { error: { message: "Invalid field selection etag on file abc123", errors: [{ reason: "invalidParameter", message: "secret detail" }] } } } }, "upload");
    expect(error.code).toBe("UPLOAD_FAILED");
    expect(error.message).toBe("Google Drive upload failed (HTTP 400 invalidParameter).");
    expect(error.message).not.toContain("abc123");
  });
});
