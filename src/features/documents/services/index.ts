import { attachmentId } from "@/features/integrations/google-drive/attachment-id";
import { createHash } from "node:crypto";
import { getCrmScope } from "@/features/crm/shared/types";
import { can, canAccessRecord, type AuthorizationActor } from "@/lib/authorization/policy";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { StorageError, type StorageAdapter } from "@/lib/storage";
import type { AuditEventInput } from "@/lib/audit/service";

import { DocumentError } from "../errors";
import { documentListSchema, documentMetadataSchema, documentUpdateSchema, type DocumentListInput, type DocumentMetadataInput } from "../schemas";
import type { DocumentRecordType } from "../types";
import type { DocumentRepository } from "../queries";

const recordPermissions: Record<DocumentRecordType, string> = {
  lead: PERMISSIONS.CRM_LEADS_READ,
  client: PERMISSIONS.CRM_CLIENTS_READ,
  deal: PERMISSIONS.CRM_DEALS_READ,
};

type DocumentServiceDependencies = {
  repository: DocumentRepository;
  storageFactory: () => StorageAdapter;
  limits: { maxFileBytes: number; allowedMimeTypes: Set<string> };
  audit?: (input: AuditEventInput) => Promise<void>;
};

type DocumentFile = {
  name: string;
  type: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
};

function recordScopeForActor(actor: AuthorizationActor) {
  const scope = getCrmScope(actor);
  return scope.kind === "global" ? "global" : scope.kind === "department" ? "department" : "owner";
}

function canAccessDocument(actor: AuthorizationActor, document: { ownerId: string | null; departmentId: string | null }, records: Array<{ type: DocumentRecordType; ownerUserId: string | null; departmentId: string | null; archived: boolean }>) {
  if (!can(actor, PERMISSIONS.DOCUMENTS_READ)) return false;
  const scope = recordScopeForActor(actor);
  const documentScope = canAccessRecord(actor, PERMISSIONS.DOCUMENTS_READ, { ownerUserId: document.ownerId, departmentId: document.departmentId }, scope);
  if (!documentScope) return false;
  return records.some((record) => !record.archived && canAccessRecord(actor, recordPermissions[record.type], { ownerUserId: record.ownerUserId, departmentId: record.departmentId }, scope));
}

function safeFilename(name: string): string {
  const basename = name.replace(/\\/g, "/").split("/").pop() ?? "document";
  const cleaned = basename
    .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/[<>:"|?*]/g, "_")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 200);
  return cleaned || "document";
}

function safeTitle(title: string, filename: string): string {
  const cleaned = title.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 255);
  return cleaned || filename;
}

function mapStorageError(error: unknown): DocumentError {
  if (!(error instanceof StorageError)) return new DocumentError("STORAGE_FAILED", "The document storage operation failed.");
  if (error.code === "CONFIGURATION_MISSING") return new DocumentError("STORAGE_CONFIGURATION_MISSING", error.message);
  if (error.code === "AUTHENTICATION_FAILED") return new DocumentError("STORAGE_AUTHENTICATION_FAILED", "Google Drive authorization failed or was revoked.");
  if (error.code === "ACCESS_DENIED" && error.status === 503) return new DocumentError("STORAGE_ACCESS_DENIED", error.message);
  if (error.code === "ACCESS_DENIED") return new DocumentError("STORAGE_ACCESS_DENIED", "Google Drive denied access to the private document folder.");
  if (error.code === "QUOTA_EXCEEDED") return new DocumentError("STORAGE_QUOTA_EXCEEDED", "Google Drive quota is unavailable; try again later.");
  return new DocumentError("STORAGE_FAILED", "The document storage operation failed.");
}

function toDocumentResponse(document: Awaited<ReturnType<DocumentRepository["findById"]>> extends infer T ? T extends { document: infer D } ? D : never : never) {
  return {
    id: document.id,
    title: document.title,
    originalFilename: document.originalFilename,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
    checksum: document.checksum,
    category: document.category,
    status: document.status,
    ownerId: document.ownerId,
    departmentId: document.departmentId,
    createdByUserId: document.createdByUserId,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    contentUrl: `/api/v1/documents/${document.id}/content`,
  };
}

export function createDocumentService({ repository, storageFactory, limits, audit: writeAudit = async () => undefined }: DocumentServiceDependencies) {
  async function audit(input: AuditEventInput) {
    await writeAudit(input);
  }

  async function getAuthorized(actor: AuthorizationActor, documentId: string) {
    const record = await repository.findById(documentId, getCrmScope(actor));
    if (!record) throw new DocumentError("NOT_FOUND", "Document not found.");
    const linkedRecords = await repository.findLinkedRecordScopes(documentId);
    if (!canAccessDocument(actor, record.document, linkedRecords)) throw new DocumentError("NOT_FOUND", "Document not found.");
    return { ...record, linkedRecords };
  }

  async function list(actor: AuthorizationActor, rawInput: unknown) {
    if (!can(actor, PERMISSIONS.DOCUMENTS_READ)) throw new DocumentError("FORBIDDEN", "You do not have permission to read documents.");
    const input = documentListSchema.parse(rawInput) satisfies DocumentListInput;
    if (input.recordType && input.recordId) {
      const record = await repository.findRecordScope(input.recordType, input.recordId);
      if (!record || record.archived || !canAccessRecord(actor, recordPermissions[input.recordType], record, recordScopeForActor(actor))) throw new DocumentError("NOT_FOUND", "The associated record was not found.");
    }
    const result = await repository.list(input, getCrmScope(actor));
    const accessible = [];
    for (const document of result.items) {
      const linkedRecords = await repository.findLinkedRecordScopes(document.id);
      if (canAccessDocument(actor, document, linkedRecords)) accessible.push(toDocumentResponse(document));
    }
    return { items: accessible, total: accessible.length < result.items.length ? accessible.length : result.total };
  }

  return {
    async list(actor: AuthorizationActor, rawInput: unknown) {
      return list(actor, rawInput);
    },

    async get(actor: AuthorizationActor, documentId: string) {
      return toDocumentResponse((await getAuthorized(actor, documentId)).document);
    },

    async create(actor: AuthorizationActor, rawMetadata: unknown, file: DocumentFile, correlationId?: string) {
      if (!can(actor, PERMISSIONS.DOCUMENTS_CREATE)) throw new DocumentError("FORBIDDEN", "You do not have permission to upload documents.");
      const metadata = documentMetadataSchema.parse(rawMetadata) satisfies DocumentMetadataInput;
      const record = await repository.findRecordScope(metadata.recordType, metadata.recordId);
      if (!record || record.archived || !canAccessRecord(actor, recordPermissions[metadata.recordType], record, recordScopeForActor(actor))) throw new DocumentError("NOT_FOUND", "The associated record was not found.");
      if (file.size > limits.maxFileBytes) throw new DocumentError("FILE_TOO_LARGE", "The document exceeds the configured size limit.");
      if (!limits.allowedMimeTypes.has(file.type)) throw new DocumentError("UNSUPPORTED_FILE_TYPE", "This document type is not allowed.");
      const filename = safeFilename(file.name);
      const title = safeTitle(metadata.title, filename);
      const body = Buffer.from(await file.arrayBuffer());
      const checksum = createHash("sha256").update(body).digest("hex");
      const id = attachmentId("document", metadata.recordType, metadata.recordId, filename, title, metadata.category ?? "", checksum);
      const document = await repository.createPending({
        id,
        title,
        originalFilename: filename,
        mimeType: file.type,
        sizeBytes: body.byteLength,
        checksum,
        category: metadata.category ?? null,
        status: "pending",
        ownerId: record.ownerUserId ?? actor.userId,
        departmentId: record.departmentId,
        createdByUserId: actor.userId,
        updatedByUserId: actor.userId,
      });
      if (document.status === "archived") throw new DocumentError("CONFLICT", "This attachment has been archived.");
      if (document.status === "available") return toDocumentResponse((await getAuthorized(actor, document.id)).document);
      await repository.linkRecord({ documentId: document.id, recordType: metadata.recordType, recordId: metadata.recordId });
      let uploaded: Awaited<ReturnType<StorageAdapter["upload"]>> | null = null;
      try {
        const storage = storageFactory();
        uploaded = await storage.upload({ category: "document", operationKey: id, filename, mimeType: file.type, body });
        await repository.createStorage({
          documentId: document.id,
          provider: uploaded.provider,
          providerObjectId: uploaded.objectId,
          providerParentId: uploaded.parentId,
          providerRevision: uploaded.revision,
          providerEtag: uploaded.etag,
          checksum: uploaded.checksum,
          sizeBytes: uploaded.sizeBytes,
          status: "uploaded",
          providerMetadata: uploaded.metadata,
          lastSyncedAt: new Date(),
        });
        const available = await repository.markAvailable(document.id, { updatedByUserId: actor.userId });
        await audit({ actorUserId: actor.userId, action: "document.upload", resourceType: "document", resourceId: document.id, outcome: "success", correlationId, metadata: { recordType: metadata.recordType, recordId: metadata.recordId, mimeType: file.type, sizeBytes: body.byteLength } });
        return toDocumentResponse(available);
      } catch (error) {
        const storageError = error instanceof StorageError ? error : null;
        await repository.markFailed(document.id, { failureCode: storageError?.code ?? "UPLOAD_FAILED", failureMessage: storageError?.message ?? "Document upload failed.", updatedByUserId: actor.userId });
        await audit({ actorUserId: actor.userId, action: "document.upload", resourceType: "document", resourceId: document.id, outcome: "failure", correlationId, metadata: { code: storageError?.code ?? "UPLOAD_FAILED", recordType: metadata.recordType } });
        if (storageError) throw mapStorageError(storageError);
        throw new DocumentError("STORAGE_FAILED", "The document could not be uploaded.");
      }
    },

    async update(actor: AuthorizationActor, documentId: string, rawInput: unknown, correlationId?: string) {
      if (!can(actor, PERMISSIONS.DOCUMENTS_UPDATE)) throw new DocumentError("FORBIDDEN", "You do not have permission to update documents.");
      const current = await getAuthorized(actor, documentId);
      const input = documentUpdateSchema.parse(rawInput);
      const updated = await repository.update(documentId, { ...input, updatedByUserId: actor.userId }, getCrmScope(actor));
      if (!updated) throw new DocumentError("NOT_FOUND", "Document not found.");
      await audit({ actorUserId: actor.userId, action: "document.update", resourceType: "document", resourceId: current.document.id, outcome: "success", correlationId, metadata: { changedFields: Object.keys(input) } });
      return toDocumentResponse(updated);
    },

    async archive(actor: AuthorizationActor, documentId: string, correlationId?: string) {
      if (!can(actor, PERMISSIONS.DOCUMENTS_DELETE)) throw new DocumentError("FORBIDDEN", "You do not have permission to archive documents.");
      const current = await getAuthorized(actor, documentId);
      const updated = await repository.archive(documentId, getCrmScope(actor), actor.userId);
      if (!updated) throw new DocumentError("NOT_FOUND", "Document not found.");
      await audit({ actorUserId: actor.userId, action: "document.archive", resourceType: "document", resourceId: current.document.id, outcome: "success", correlationId });
      return toDocumentResponse(updated);
    },

    async download(actor: AuthorizationActor, documentId: string, correlationId?: string) {
      const current = await getAuthorized(actor, documentId);
      if (current.document.status !== "available" || !current.storage) throw new DocumentError("STORAGE_FAILED", "The document content is not available.");
      try {
        const download = await storageFactory().download(current.storage.providerObjectId);
        await audit({ actorUserId: actor.userId, action: "document.download", resourceType: "document", resourceId: documentId, outcome: "success", correlationId });
        return download;
      } catch (error) {
        await audit({ actorUserId: actor.userId, action: "document.download", resourceType: "document", resourceId: documentId, outcome: "failure", correlationId, metadata: { code: "DOWNLOAD_FAILED" } });
        if (error instanceof StorageError) throw mapStorageError(error);
        throw new DocumentError("STORAGE_FAILED", "The document content could not be retrieved.");
      }
    },

  };
}
