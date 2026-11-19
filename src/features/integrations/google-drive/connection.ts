import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { google, type drive_v3 } from "googleapis";

import { db } from "@/db";
import { categoryLabel, type DriveCategory } from "./categories";
import { reserveUpload } from "./upload-operations";
import { driveFolderMappings, googleDriveConnections } from "@/db/schema";
import { decryptToken, encryptToken } from "@/lib/crypto/token-cipher";
import { getGoogleDriveEnv } from "@/lib/env";
import { StorageError } from "@/lib/storage";

import { createGoogleDriveStorageAdapter, providerError, type GoogleDriveContext } from "./adapter";

export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const TOKEN_PURPOSE = "google_drive_refresh_token";
const FOLDER_MIME = "application/vnd.google-apps.folder";

export type DriveConnection = typeof googleDriveConnections.$inferSelect;
/** Safe view of a connection: never includes the (encrypted) refresh token. */
export type DriveConnectionSummary = Omit<DriveConnection, "encryptedRefreshToken">;

export function hasDriveScope(scope: string | null | undefined) {
  return Boolean(scope?.split(/\s+/).includes(DRIVE_FILE_SCOPE));
}

function encryptionKey() {
  return getGoogleDriveEnv().GOOGLE_TOKEN_ENCRYPTION_KEY;
}

function oauthClientCredentials() {
  const clientId = process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET;
  if (!clientId || !clientSecret) throw new StorageError("CONFIGURATION_MISSING", "Google OAuth is not configured.", 503);
  return { clientId, clientSecret };
}

/** True when the google_drive_connections migration (0010) has not been applied yet. */
export function isMissingConnectionsTable(error: unknown): boolean {
  for (let current: unknown = error, depth = 0; current && depth < 4; depth++) {
    if (typeof current === "object" && "code" in current && (current as { code?: unknown }).code === "42P01") return true;
    current = typeof current === "object" && "cause" in current ? (current as { cause?: unknown }).cause : undefined;
  }
  return false;
}

export async function getActiveConnection(): Promise<DriveConnection | null> {
  try {
    const [row] = await db.select().from(googleDriveConnections).where(eq(googleDriveConnections.status, "active")).orderBy(desc(googleDriveConnections.createdAt)).limit(1);
    return row ?? null;
  } catch (error) {
    if (isMissingConnectionsTable(error)) throw new StorageError("CONFIGURATION_MISSING", "Google Drive storage is not set up yet (database migration 0010 has not been applied).", 503);
    throw error;
  }
}

export async function getConnectionSummary(): Promise<DriveConnectionSummary | null> {
  const row = await getActiveConnection();
  if (!row) return null;
  const { encryptedRefreshToken: _secret, ...summary } = row;
  void _secret;
  return summary;
}

/** Called from the Auth.js sign-in callback when Google returned a drive.file refresh token. */
export async function saveConnectionFromOAuth(input: { userId: string; email: string; subject: string | null; refreshToken: string; scopes: string }) {
  const encrypted = encryptToken(input.refreshToken, TOKEN_PURPOSE, encryptionKey());
  return db.transaction(async (tx) => {
    const [active] = await tx.select().from(googleDriveConnections).where(eq(googleDriveConnections.status, "active")).limit(1);
    const [priorIdentity] = await tx.select().from(googleDriveConnections).where(input.subject
      ? eq(googleDriveConnections.googleSubject, input.subject)
      : eq(googleDriveConnections.googleAccountEmail, input.email.toLowerCase())).orderBy(desc(googleDriveConnections.createdAt)).limit(1);
    if (active && priorIdentity && active.id !== priorIdentity.id) {
      await tx.update(googleDriveConnections).set({ status: "revoked", revokedAt: new Date(), lastErrorCode: "REPLACED" }).where(eq(googleDriveConnections.id, active.id));
    }
    const previous = priorIdentity ?? active;
    if (previous && (previous.googleSubject && input.subject ? previous.googleSubject === input.subject : previous.googleAccountEmail.toLowerCase() === input.email.toLowerCase())) {
      await tx.update(googleDriveConnections).set({ status: "active", revokedAt: null, connectedByUserId: input.userId, googleSubject: input.subject, encryptedRefreshToken: encrypted, scopes: input.scopes, lastErrorCode: null, updatedAt: new Date() }).where(eq(googleDriveConnections.id, previous.id));
      clients.delete(previous.id);
      return { id: previous.id };
    }
    if (previous) {
      await tx.update(googleDriveConnections).set({ status: "revoked", revokedAt: new Date(), lastErrorCode: "REPLACED", updatedAt: new Date() }).where(eq(googleDriveConnections.id, previous.id));
    }
    // A different Google identity must choose its own parent and category folders.
    const [created] = await tx.insert(googleDriveConnections).values({
      connectedByUserId: input.userId,
      googleAccountEmail: input.email,
      googleSubject: input.subject,
      encryptedRefreshToken: encrypted,
      scopes: input.scopes,
      folderId: null,
      folderName: null,
      folderVerifiedAt: null,
    }).returning({ id: googleDriveConnections.id });
    return created;
  });
}

export async function markConnectionRevoked(id: string, code: string) {
  await db.update(googleDriveConnections).set({ status: "revoked", revokedAt: new Date(), lastErrorCode: code.slice(0, 100), updatedAt: new Date() }).where(and(eq(googleDriveConnections.id, id), eq(googleDriveConnections.status, "active")));
}

export async function saveVerifiedFolder(id: string, folder: { id: string; name: string }) {
  await db.update(googleDriveConnections).set({ folderId: folder.id, folderName: folder.name.slice(0, 255), folderVerifiedAt: new Date(), lastErrorCode: null, updatedAt: new Date() }).where(and(eq(googleDriveConnections.id, id), eq(googleDriveConnections.status, "active")));
}

// One OAuth2 client per connection per server process, so access tokens are reused until they expire
// (googleapis refreshes them automatically from the refresh token). Access tokens are never persisted.
const clients = new Map<string, { client: InstanceType<typeof google.auth.OAuth2>; version: number }>();

export function oauthClientFor(connection: DriveConnection) {
  const cached = clients.get(connection.id);
  if (cached && cached.version === connection.updatedAt.getTime()) return cached.client;
  const { clientId, clientSecret } = oauthClientCredentials();
  const client = new google.auth.OAuth2(clientId, clientSecret);
  client.setCredentials({ refresh_token: decryptToken(connection.encryptedRefreshToken, TOKEN_PURPOSE, encryptionKey()), scope: connection.scopes });
  clients.set(connection.id, { client, version: connection.updatedAt.getTime() });
  return client;
}

async function requireConnection() {
  const connection = await getActiveConnection();
  if (!connection) throw new StorageError("CONFIGURATION_MISSING", "Google Drive is not connected. An administrator can connect it in Settings → Integrations → Google Drive.", 503);
  return connection;
}

export function driveFor(connection: DriveConnection): drive_v3.Drive {
  return google.drive({ version: "v3", auth: oauthClientFor(connection) });
}

export type FolderCheck =
  | { ok: true; folder: { id: string; name: string } }
  | { ok: false; reason: "outside_parent" | "not_accessible" | "not_a_folder" | "read_only" | "trashed" | "auth_failed" | "error" };

/** Checks whether the app (drive.file) can see and write to a folder. */
export async function checkFolderAccess(connection: DriveConnection, folderId: string, parentId?: string): Promise<FolderCheck> {
  try {
    const { data } = await driveFor(connection).files.get({ fileId: folderId, fields: "id,name,mimeType,parents,trashed,capabilities(canAddChildren)", supportsAllDrives: true });
    if (data.mimeType !== FOLDER_MIME) return { ok: false, reason: "not_a_folder" };
    if (data.trashed) return { ok: false, reason: "trashed" };
    if (parentId && !data.parents?.includes(parentId)) return { ok: false, reason: "outside_parent" };
    if (data.capabilities?.canAddChildren !== true) return { ok: false, reason: "read_only" };
    return { ok: true, folder: { id: data.id ?? folderId, name: data.name ?? "Folder" } };
  } catch (error) {
    const mapped = providerError(error, "metadata");
    if (mapped.code === "AUTHENTICATION_FAILED") {
      await markConnectionRevoked(connection.id, "INVALID_GRANT");
      clients.delete(connection.id);
      return { ok: false, reason: "auth_failed" };
    }
    if (mapped.code === "NOT_FOUND" || mapped.code === "ACCESS_DENIED") return { ok: false, reason: "not_accessible" };
    return { ok: false, reason: "error" };
  }
}

/** Short-lived drive.file access token for the Google Picker. The refresh token never leaves the server. */
export async function pickerAccessToken() {
  const connection = await requireConnection();
  try {
    const { token } = await oauthClientFor(connection).getAccessToken();
    if (!token) throw new StorageError("AUTHENTICATION_FAILED", "Google did not issue an access token.", 503);
    return token;
  } catch (error) {
    const mapped = error instanceof StorageError ? error : providerError(error, "metadata");
    if (mapped.code === "AUTHENTICATION_FAILED") {
      await markConnectionRevoked(connection.id, "INVALID_GRANT");
      clients.delete(connection.id);
    }
    throw mapped;
  }
}

export async function revokeConnection(connection: DriveConnection) {
  try {
    await oauthClientFor(connection).revokeCredentials();
  } catch {
    // Best effort: the local connection is disabled regardless.
  }
  clients.delete(connection.id);
  await markConnectionRevoked(connection.id, "DISCONNECTED");
}

/** Storage adapter bound to the active connection and its verified folder. */
export function createConnectedDriveStorageAdapter() {
  let current: DriveConnection | null = null;
  return createGoogleDriveStorageAdapter({
    async resolve(file): Promise<GoogleDriveContext> {
      const connection = await requireConnection();
      current = connection;
      const drive = driveFor(connection);
      const context = { drive, sharedDriveId: getGoogleDriveEnv().GOOGLE_DRIVE_SHARED_DRIVE_ID };
      if (!file) return context;
      if (!file.category) throw new StorageError("UPLOAD_FAILED", "The upload destination is missing.");
      const mapping = await getMapping(connection.id, file.category);
      const message = `Choose or reauthorize the ${categoryLabel[file.category]} folder in Settings ? Integrations ? Google Drive.`;
      if (!connection.folderId || !mapping) throw new StorageError("ACCESS_DENIED", message, 503);
      const checked = await checkFolderAccess(connection, mapping.folderId, connection.folderId);
      if (!checked.ok) throw new StorageError("ACCESS_DENIED", message, 503);
      if (!file.operationKey) return { ...context, folderId: mapping.folderId };
      const reservation = await reserveUpload(connection.id, file.category, file.operationKey, mapping.folderId, drive);
      return { ...context, folderId: mapping.folderId, reservation };
    },
    async onAuthFailure() {
      if (!current) return;
      clients.delete(current.id);
      await markConnectionRevoked(current.id, "INVALID_GRANT");
    },
  });
}

export type DriveReadiness =
  | { ready: true; folderName: string | null; accountEmail: string }
  | { ready: false; reason: "not_configured" | "migration_pending" | "not_connected" | "folder_not_authorized" | "error"; message: string };

/** Whether uploads can work right now, with a user-facing reason when they cannot. Never throws. */
export async function getMapping(connectionId: string, category: DriveCategory) {
  try {
    const [row] = await db.select().from(driveFolderMappings).where(and(eq(driveFolderMappings.connectionId, connectionId), eq(driveFolderMappings.category, category)));
    return row;
  } catch (error) {
    if (isMissingConnectionsTable(error)) throw new StorageError("CONFIGURATION_MISSING", "Drive folder mappings require database migration 0011.", 503);
    throw error;
  }
}

export async function getDriveReadiness(category?: DriveCategory): Promise<DriveReadiness> {
  let env;
  try { env = getGoogleDriveEnv(); } catch { return { ready: false, reason: "not_configured", message: "Google Drive server settings are incomplete." }; }
  if (!env.GOOGLE_TOKEN_ENCRYPTION_KEY || !process.env.AUTH_GOOGLE_ID || !process.env.AUTH_GOOGLE_SECRET) return { ready: false, reason: "not_configured", message: "Google Drive server settings are incomplete." };
  try {
    const connection = await getActiveConnection();
    if (!connection) return { ready: false, reason: "not_connected", message: "Google Drive is not connected yet." };
    if (!connection.folderId || !connection.folderVerifiedAt) return { ready: false, reason: "folder_not_authorized", message: "Google Drive is connected, but the receipts folder has not been chosen yet." };
    const mapping = category && await getMapping(connection.id, category);
    if (category && !mapping) return { ready: false, reason: "folder_not_authorized", message: `Choose the ${categoryLabel[category]} folder in Google Drive settings.` };
    return { ready: true, folderName: mapping?.folderName ?? connection.folderName, accountEmail: connection.googleAccountEmail };
  } catch (error) {
    if (error instanceof StorageError && error.code === "CONFIGURATION_MISSING") return { ready: false, reason: "migration_pending", message: error.message };
    return { ready: false, reason: "error", message: "Google Drive status could not be checked." };
  }
}
