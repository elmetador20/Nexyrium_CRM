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

export type GoogleDriveContext = { drive: drive_v3.Drive; folderId: string; sharedDriveId?: string };

type AdapterInput =
  | { resolve: () => Promise<GoogleDriveContext>; onAuthFailure?: () => Promise<void> }
  | { config: { folderId: string; sharedDriveId?: string }; drive: drive_v3.Drive };

/**
 * Google Drive storage adapter. Authentication is resolved lazily per operation through `resolve`
 * (an OAuth2 client built server-side from the encrypted refresh token), so callers never hold
 * credentials. `onAuthFailure` lets the connection layer record a revoked or expired grant.
 */
export function createGoogleDriveStorageAdapter(input: AdapterInput): StorageAdapter {
  const resolve = "resolve" in input ? input.resolve : async () => ({ drive: input.drive, folderId: input.config.folderId, sharedDriveId: input.config.sharedDriveId });
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
    async upload(file: StorageUploadInput) {
      try {
        const { drive, folderId, sharedDriveId } = await resolve();
        const response = await drive.files.create({
          requestBody: { name: file.filename, mimeType: file.mimeType, parents: [folderId] },
          media: { mimeType: file.mimeType, body: Readable.from(file.body) },
          uploadType: "resumable",
          // Drive API v3 has no "etag" file field; requesting it makes Google reject the upload (HTTP 400).
          fields: FILE_FIELDS,
          supportsAllDrives: Boolean(sharedDriveId),
        }) as unknown as { data: drive_v3.Schema$File };
        return metadataFromFile(response.data, folderId);
      } catch (error) {
        return fail(error, "upload");
      }
    },
    async getMetadata(objectId: string) {
      try {
        const { drive, sharedDriveId } = await resolve();
        const response = await drive.files.get({ fileId: objectId, fields: FILE_FIELDS, supportsAllDrives: Boolean(sharedDriveId) });
        return metadataFromFile(response.data, response.data.parents?.[0] ?? null);
      } catch (error) {
        return fail(error, "metadata");
      }
    },
    async download(objectId: string): Promise<StorageDownload> {
      try {
        const metadata = await this.getMetadata(objectId);
        const { drive, sharedDriveId } = await resolve();
        const response = await drive.files.get({ fileId: objectId, alt: "media", supportsAllDrives: Boolean(sharedDriveId) }, { responseType: "arraybuffer" });
        return { mimeType: metadata.mimeType, filename: metadata.filename, sizeBytes: metadata.sizeBytes, body: toBuffer(response.data) };
      } catch (error) {
        return fail(error, "download");
      }
    },
    async delete(objectId: string) {
      try {
        const { drive, sharedDriveId } = await resolve();
        await drive.files.delete({ fileId: objectId, supportsAllDrives: Boolean(sharedDriveId) });
      } catch (error) {
        return fail(error, "delete");
      }
    },
  };
}

export function checksumForBuffer(body: Buffer): string {
  return createHash("sha256").update(body).digest("hex");
}
