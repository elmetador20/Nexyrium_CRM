import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { google, type drive_v3 } from "googleapis";

import { db } from "@/db";
import { googleDriveConnections } from "@/db/schema";
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
    const [previous] = await tx.select().from(googleDriveConnections).where(eq(googleDriveConnections.status, "active")).limit(1);
    if (previous) {
      await tx.update(googleDriveConnections).set({ status: "revoked", revokedAt: new Date(), lastErrorCode: "REPLACED", updatedAt: new Date() }).where(eq(googleDriveConnections.id, previous.id));
    }
    // A reconnect of the same Google account keeps the authorized folder (drive.file grants persist per app).
    const keepFolder = previous && previous.googleAccountEmail.toLowerCase() === input.email.toLowerCase();
    const [created] = await tx.insert(googleDriveConnections).values({
      connectedByUserId: input.userId,
      googleAccountEmail: input.email,
      googleSubject: input.subject,
      encryptedRefreshToken: encrypted,
      scopes: input.scopes,
      folderId: keepFolder ? previous.folderId : null,
      folderName: keepFolder ? previous.folderName : null,
      folderVerifiedAt: keepFolder ? previous.folderVerifiedAt : null,
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
const clients = new Map<string, InstanceType<typeof google.auth.OAuth2>>();

export function oauthClientFor(connection: DriveConnection) {
  const cached = clients.get(connection.id);
  if (cached) return cached;
  const { clientId, clientSecret } = oauthClientCredentials();
  const client = new google.auth.OAuth2(clientId, clientSecret);
  client.setCredentials({ refresh_token: decryptToken(connection.encryptedRefreshToken, TOKEN_PURPOSE, encryptionKey()), scope: connection.scopes });
  clients.set(connection.id, client);
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
  | { ok: false; reason: "not_accessible" | "not_a_folder" | "read_only" | "trashed" | "auth_failed" | "error" };

/** Checks whether the app (drive.file) can see and write to a folder. */
export async function checkFolderAccess(connection: DriveConnection, folderId: string): Promise<FolderCheck> {
  try {
    const { data } = await driveFor(connection).files.get({ fileId: folderId, fields: "id,name,mimeType,trashed,capabilities(canAddChildren)", supportsAllDrives: true });
    if (data.mimeType !== FOLDER_MIME) return { ok: false, reason: "not_a_folder" };
    if (data.trashed) return { ok: false, reason: "trashed" };
    if (data.capabilities?.canAddChildren === false) return { ok: false, reason: "read_only" };
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
    async resolve(): Promise<GoogleDriveContext> {
      const connection = await requireConnection();
      if (!connection.folderId || !connection.folderVerifiedAt) {
        throw new StorageError("ACCESS_DENIED", "The receipts folder has not been authorized yet. Choose it in Settings → Integrations → Google Drive.", 503);
      }
      current = connection;
      return { drive: driveFor(connection), folderId: connection.folderId, sharedDriveId: getGoogleDriveEnv().GOOGLE_DRIVE_SHARED_DRIVE_ID };
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
export async function getDriveReadiness(): Promise<DriveReadiness> {
  let env;
  try { env = getGoogleDriveEnv(); } catch { return { ready: false, reason: "not_configured", message: "Google Drive server settings are incomplete." }; }
  if (!env.GOOGLE_TOKEN_ENCRYPTION_KEY || !process.env.AUTH_GOOGLE_ID || !process.env.AUTH_GOOGLE_SECRET) return { ready: false, reason: "not_configured", message: "Google Drive server settings are incomplete." };
  try {
    const connection = await getActiveConnection();
    if (!connection) return { ready: false, reason: "not_connected", message: "Google Drive is not connected yet." };
    if (!connection.folderId || !connection.folderVerifiedAt) return { ready: false, reason: "folder_not_authorized", message: "Google Drive is connected, but the receipts folder has not been chosen yet." };
    return { ready: true, folderName: connection.folderName, accountEmail: connection.googleAccountEmail };
  } catch (error) {
    if (error instanceof StorageError && error.code === "CONFIGURATION_MISSING") return { ready: false, reason: "migration_pending", message: "Google Drive storage is waiting for its database setup (migration 0010)." };
    return { ready: false, reason: "error", message: "Google Drive status could not be checked." };
  }
}
