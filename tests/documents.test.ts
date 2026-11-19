import { describe, expect, it, vi } from "vitest";

import type { DocumentRepository } from "@/features/documents/queries";
import { createDocumentService } from "@/features/documents/services";
import { createGoogleDriveStorageAdapter } from "@/features/integrations/google-drive/adapter";
import type { StorageAdapter } from "@/lib/storage";
import { StorageError } from "@/lib/storage";
import type { AuthorizationActor } from "@/lib/authorization/policy";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { ROLE_SLUGS } from "@/lib/authorization/roles";
import type { Document, DocumentStorageObject } from "@/db/schema";

const actor: AuthorizationActor = {
  userId: "owner-1",
  email: "owner@example.com",
  name: "Owner",
  isActive: true,
  roles: [ROLE_SLUGS.SALES],
  permissions: [PERMISSIONS.DOCUMENTS_READ, PERMISSIONS.DOCUMENTS_CREATE, PERMISSIONS.DOCUMENTS_UPDATE, PERMISSIONS.DOCUMENTS_DELETE, PERMISSIONS.CRM_LEADS_READ],
  departmentIds: ["department-1"],
};

const recordId = "11111111-1111-4111-8111-111111111111";

function dataBuffer(): ArrayBuffer {
  const value = Buffer.from("data");
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}

function documentFixture(overrides: Partial<Document> = {}): Document {
  return {
    id: "document-1",
    title: "Brief",
    originalFilename: "brief.pdf",
    mimeType: "application/pdf",
    sizeBytes: 4,
    checksum: "checksum",
    category: "brief",
    status: "available",
    ownerId: actor.userId,
    departmentId: "department-1",
    createdByUserId: actor.userId,
    updatedByUserId: actor.userId,
    failureCode: null,
    failureMessage: null,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function storageFixture(overrides: Partial<DocumentStorageObject> = {}): DocumentStorageObject {
  return {
    id: "storage-1",
    documentId: "document-1",
    provider: "google_drive",
    providerObjectId: "drive-object-1",
    providerParentId: "folder-1",
    providerRevision: "1",
    providerEtag: null,
    checksum: "checksum",
    sizeBytes: 4,
    status: "uploaded",
    providerMetadata: {},
    lastSyncedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeRepository(): DocumentRepository {
  let document = documentFixture({ status: "pending" });
  let storage: DocumentStorageObject | null = null;
  return {
    async list() { return { items: [document], total: 1 }; },
    async findById() { return { document, storage }; },
    async findRecordScope() { return { id: "lead-1", ownerUserId: actor.userId, departmentId: "department-1", archived: false }; },
    async findLinkedRecordScopes() { return [{ type: "lead" as const, id: "lead-1", ownerUserId: actor.userId, departmentId: "department-1", archived: false }]; },
    async createPending(input) { document = documentFixture({ ...input, id: "document-1", createdAt: new Date(), updatedAt: new Date() }); return document; },
    async linkRecord() {},
    async createStorage(input) { storage = storageFixture(input); return storage; },
    async markAvailable(_id, input) { document = documentFixture({ ...document, status: "available", updatedByUserId: input.updatedByUserId }); return document; },
    async markFailed(_id, input) { document = documentFixture({ ...document, status: "failed", failureCode: input.failureCode, failureMessage: input.failureMessage }); },
    async update(_id, input) { document = documentFixture({ ...document, ...input }); return document; },
    async archive() { document = documentFixture({ ...document, status: "archived", archivedAt: new Date() }); return document; },
  };
}

describe("document service", () => {
  it("uploads through a provider-neutral adapter and never returns provider object IDs", async () => {
    const repository = makeRepository();
    const storage: StorageAdapter = {
      provider: "google_drive",
      upload: vi.fn(async () => ({ provider: "google_drive" as const, objectId: "secret-drive-id", parentId: "folder-1", filename: "brief.pdf", mimeType: "application/pdf", sizeBytes: 4, checksum: "checksum", revision: "1", etag: null, metadata: {} })),
      getMetadata: vi.fn(),
      download: vi.fn(async () => ({ filename: "brief.pdf", mimeType: "application/pdf", sizeBytes: 4, body: Buffer.from("data") })),
      delete: vi.fn(),
    };
    const service = createDocumentService({ repository, storageFactory: () => storage, limits: { maxFileBytes: 10, allowedMimeTypes: new Set(["application/pdf"]) } });
    const result = await service.create(actor, { title: "Brief", category: "brief", recordType: "lead", recordId }, { name: "../brief.pdf", type: "application/pdf", size: 4, arrayBuffer: async () => dataBuffer() }, "correlation-1");

    expect(result).toMatchObject({ id: "document-1", originalFilename: "brief.pdf", status: "available" });
    expect(result).not.toHaveProperty("providerObjectId");
    expect(storage.upload).toHaveBeenCalledWith(expect.objectContaining({ filename: "brief.pdf", mimeType: "application/pdf" }));
  });

  it("does not call storage when the associated record is outside the actor scope", async () => {
    const repository = makeRepository();
    repository.findRecordScope = async () => ({ id: "lead-1", ownerUserId: "other-owner", departmentId: "other-department", archived: false });
    const storage: StorageAdapter = { provider: "google_drive", upload: vi.fn(), getMetadata: vi.fn(), download: vi.fn(), delete: vi.fn() };
    const service = createDocumentService({ repository, storageFactory: () => storage, limits: { maxFileBytes: 10, allowedMimeTypes: new Set(["application/pdf"]) } });

    await expect(service.create(actor, { title: "Brief", recordType: "lead", recordId }, { name: "brief.pdf", type: "application/pdf", size: 4, arrayBuffer: async () => dataBuffer() })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("maps missing storage configuration to a clear error", async () => {
    const repository = makeRepository();
    const service = createDocumentService({ repository, storageFactory: () => { throw new StorageError("CONFIGURATION_MISSING", "not configured"); }, limits: { maxFileBytes: 10, allowedMimeTypes: new Set(["application/pdf"]) } });
    await expect(service.create(actor, { title: "Brief", recordType: "lead", recordId }, { name: "brief.pdf", type: "application/pdf", size: 4, arrayBuffer: async () => dataBuffer() })).rejects.toMatchObject({ code: "STORAGE_CONFIGURATION_MISSING" });
  });

  it("surfaces quota failures without exposing provider details", async () => {
    const repository = makeRepository();
    const storage: StorageAdapter = { provider: "google_drive", upload: vi.fn(async () => { throw new StorageError("QUOTA_EXCEEDED", "provider quota details"); }), getMetadata: vi.fn(), download: vi.fn(), delete: vi.fn() };
    const service = createDocumentService({ repository, storageFactory: () => storage, limits: { maxFileBytes: 10, allowedMimeTypes: new Set(["application/pdf"]) } });
    await expect(service.create(actor, { title: "Brief", recordType: "lead", recordId }, { name: "brief.pdf", type: "application/pdf", size: 4, arrayBuffer: async () => dataBuffer() })).rejects.toMatchObject({ code: "STORAGE_QUOTA_EXCEEDED", message: "Google Drive quota is unavailable; try again later." });
  });
});

describe("Google Drive adapter with mocked responses", () => {
  it("maps upload, metadata, download, and delete responses without exposing credentials", async () => {
    const files = {
      create: vi.fn(async () => ({ data: { id: "drive-1", name: "brief.pdf", mimeType: "application/pdf", size: "4", md5Checksum: "md5", version: "1", parents: ["folder-1"] } })),
      get: vi.fn(async (input: { alt?: string }) => input.alt === "media" ? { data: Buffer.from("data") } : { data: { id: "drive-1", name: "brief.pdf", mimeType: "application/pdf", size: "4", md5Checksum: "md5", version: "1", parents: ["folder-1"] } }),
      delete: vi.fn(async () => ({ data: {} })),
    };
    const adapter = createGoogleDriveStorageAdapter({ config: { folderId: "folder-1" }, drive: { files } } as never);
    const uploaded = await adapter.upload({ filename: "brief.pdf", mimeType: "application/pdf", body: Buffer.from("data") });
    const metadata = await adapter.getMetadata("drive-1");
    const downloaded = await adapter.download("drive-1");
    await adapter.delete("drive-1");

    expect(uploaded).toMatchObject({ provider: "google_drive", objectId: "drive-1", parentId: "folder-1" });
    expect(metadata.objectId).toBe("drive-1");
    expect(downloaded.body.toString()).toBe("data");
    expect(files.delete).toHaveBeenCalledWith(expect.objectContaining({ fileId: "drive-1" }));
    expect(JSON.stringify(uploaded)).not.toContain("private");
  });
});
