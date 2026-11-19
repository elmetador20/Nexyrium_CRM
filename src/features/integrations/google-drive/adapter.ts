import { createHash } from "node:crypto";
import { Readable } from "node:stream";

import type { drive_v3 } from "googleapis";

import { StorageError, type StorageAdapter, type StorageDownload, type StorageObject, type StorageUploadInput } from "@/lib/storage";

const FILE_FIELDS = "id,name,mimeType,size,md5Checksum,version,webViewLink,createdTime,modifiedTime,parents";

export function providerError(error: unknown, operation: "upload" | "download" | "delete" | "metadata"): StorageError {
  const response = typeof error === "object" && error && "response" in error ? (error as { response?: { status?: unknown; data?: { error?: unknown } } }).response : undefined;
  const status = typeof response?.status === "number" ? response.status : undefined;
  const oauthError = response?.data?.error;
  if (oauthError === "invalid_grant" || (error instanceof Error && /invalid_grant/.test(error.message))) {
    return new StorageError("AUTHENTICATION_FAILED", "Google Drive access was revoked or has expired. Reconnect Google Drive in Settings.", 503);
  }
  if (status === 401) return new StorageError("AUTHENTICATION_FAILED", "Google Drive authentication failed.", 503);
  if (status === 403) return new StorageError("ACCESS_DENIED", "Google Drive access was denied.", 502);
  if (status === 404) return new StorageError("NOT_FOUND", "The Google Drive object was not found.", 404);
  if (status === 429 || status === 507) return new StorageError("QUOTA_EXCEEDED", "Google Drive quota is currently unavailable.", 503);
  // Keep the HTTP status and Google reason code (no message text, ids or credentials) for diagnostics.
  const reason = (response?.data as { error?: { errors?: Array<{ reason?: unknown }> } } | undefined)?.error?.errors?.[0]?.reason;
  const detail = [status ? `HTTP ${status}` : null, typeof reason === "string" ? reason.replace(/[^A-Za-z0-9_]/g, "").slice(0, 60) : null].filter(Boolean).join(" ");
  return new StorageError(`${operation.toUpperCase()}_FAILED` as StorageError["code"], `Google Drive ${operation} failed${detail ? ` (${detail})` : ""}.`, 502);
}

function toBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (typeof value === "string") return Buffer.from(value);
  return Buffer.from(value as Uint8Array);
}

function metadataFromFile(file: drive_v3.Schema$File, parentId: string | null): StorageObject {
  if (!file.id) throw new StorageError("UPLOAD_FAILED", "Google Drive returned no file identifier.");
  return {
    provider: "google_drive",
    objectId: file.id,
    parentId,
    filename: file.name ?? "document",
    mimeType: file.mimeType ?? "application/octet-stream",
    sizeBytes: Number(file.size ?? 0),
    checksum: file.md5Checksum ?? null,
    revision: file.version ?? null,
    etag: null,
    metadata: {
      webViewLink: file.webViewLink ?? null,
      createdTime: file.createdTime ?? null,
      modifiedTime: file.modifiedTime ?? null,
    },
  };
}

type DestinationRequest = Pick<StorageUploadInput, "category" | "operationKey">;

export type GoogleDriveContext = { drive: drive_v3.Drive; folderId?: string; sharedDriveId?: string; reservation?: { fileId: string; complete: () => PromiseLike<unknown> } };

type AdapterInput =
  | { resolve: (file?: DestinationRequest) => Promise<GoogleDriveContext>; onAuthFailure?: () => Promise<void> }
  | { config: { folderId: string; sharedDriveId?: string }; drive: drive_v3.Drive };

/**
 * Google Drive storage adapter. Authentication is resolved lazily per operation through `resolve`
 * (an OAuth2 client built server-side from the encrypted refresh token), so callers never hold
 * credentials. `onAuthFailure` lets the connection layer record a revoked or expired grant.
 */
export function createGoogleDriveStorageAdapter(input: AdapterInput): StorageAdapter {
  const resolve: (file?: DestinationRequest) => Promise<GoogleDriveContext> = "resolve" in input ? input.resolve : async () => ({ drive: input.drive, folderId: input.config.folderId, sharedDriveId: input.config.sharedDriveId });
  const onAuthFailure = "resolve" in input ? input.onAuthFailure : undefined;

  async function fail(error: unknown, operation: "upload" | "download" | "delete" | "metadata"): Promise<never> {
    if (error instanceof StorageError) throw error;
    const mapped = providerError(error, operation);
    console.error("[google-drive] operation failed", { operation, code: mapped.code, detail: mapped.message });
    if (mapped.code === "AUTHENTICATION_FAILED" && onAuthFailure) await onAuthFailure().catch(() => undefined);
    throw mapped;
  }

  return {
    provider: "google_drive",
    async verifyDestination(category, objectId, md5) {
      try {
        const { drive, folderId } = await resolve({ category });
        if (!folderId) throw new StorageError("ACCESS_DENIED", "Choose the destination folder first.", 503);
        const file = await drive.files.get({
          fileId: objectId, fields: "id,trashed,parents,md5Checksum,capabilities(canDownload)", supportsAllDrives: true,
        }).catch(error => {
          const status = error?.response?.status;
          const reasons = error?.response?.data?.error?.errors;
          const deniedForFile = status === 403 && Array.isArray(reasons)
            && reasons.some(reason => reason?.reason === "insufficientFilePermissions");
          if (status === 404 || deniedForFile) return null;
          throw error;
        });
        return Boolean(file && file.data.id === objectId && !file.data.trashed && file.data.parents?.includes(folderId)
          && file.data.md5Checksum === md5 && file.data.capabilities?.canDownload === true);
      } catch (error) {
        return fail(error, "metadata");
      }
    },
    async upload(file: StorageUploadInput) {
      try {
        if ("resolve" in input && file.category && !file.operationKey) throw new StorageError("UPLOAD_FAILED", "An upload operation key is required.");
        const { drive, folderId, reservation } = await resolve(file);
        if (!folderId) throw new StorageError("ACCESS_DENIED", "Choose a destination folder first.", 503);
        const response = await drive.files.create({
          requestBody: { id: reservation?.fileId, name: file.filename, mimeType: file.mimeType, parents: [folderId] },
          media: { mimeType: file.mimeType, body: Readable.from(file.body) },
          uploadType: "resumable",
          // Drive API v3 has no "etag" file field; requesting it makes Google reject the upload (HTTP 400).
          fields: FILE_FIELDS,
          supportsAllDrives: true,
        }).catch(async error => {
          // Google may have accepted a previous create even if the response was lost.
          if (!reservation || error?.response?.status !== 409) throw error;
          const existing = await drive.files.get({ fileId: reservation.fileId, fields: FILE_FIELDS + ",trashed", supportsAllDrives: true });
          const md5 = createHash("md5").update(file.body).digest("hex");
          if (existing.data.trashed || !existing.data.parents?.includes(folderId) || existing.data.md5Checksum !== md5) {
            throw new StorageError("UPLOAD_FAILED", "The reserved Drive file could not be verified.");
          }
          return existing;
        }) as unknown as { data: drive_v3.Schema$File };
        await reservation?.complete();
        return metadataFromFile(response.data, folderId);
      } catch (error) {
        return fail(error, "upload");
      }
    },
    async getMetadata(objectId: string) {
      try {
        const { drive } = await resolve();
        const response = await drive.files.get({ fileId: objectId, fields: FILE_FIELDS, supportsAllDrives: true });
        return metadataFromFile(response.data, response.data.parents?.[0] ?? null);
      } catch (error) {
        return fail(error, "metadata");
      }
    },
    async download(objectId: string): Promise<StorageDownload> {
      try {
        const metadata = await this.getMetadata(objectId);
        const { drive } = await resolve();
        const response = await drive.files.get({ fileId: objectId, alt: "media", supportsAllDrives: true }, { responseType: "arraybuffer" });
        return { mimeType: metadata.mimeType, filename: metadata.filename, sizeBytes: metadata.sizeBytes, body: toBuffer(response.data) };
      } catch (error) {
        return fail(error, "download");
      }
    },
    async delete(objectId: string) {
      try {
        const { drive } = await resolve();
        await drive.files.delete({ fileId: objectId, supportsAllDrives: true });
      } catch (error) {
        return fail(error, "delete");
      }
    },
  };
}

export function checksumForBuffer(body: Buffer): string {
  return createHash("sha256").update(body).digest("hex");
}
