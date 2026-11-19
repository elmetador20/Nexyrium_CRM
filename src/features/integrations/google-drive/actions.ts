"use server";

import { revalidatePath } from "next/cache";

import { signIn } from "@/auth";
import { recordAuditEvent } from "@/lib/audit/service";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { requirePermission } from "@/lib/authorization/server";
import { getGoogleDriveEnv } from "@/lib/env";

import { checkFolderAccess, DRIVE_FILE_SCOPE, getActiveConnection, revokeConnection, saveVerifiedFolder, type FolderCheck } from "./connection";

import { db } from "@/db";
import { driveFolderMappings } from "@/db/schema";
import { driveCategories, categoryLabel, type DriveCategory } from "./categories";

const SETTINGS_PATH = "/settings/integrations/google-drive";

export type DriveActionState = { status: "idle" | "success" | "error" | "needs_picker"; message?: string };

const FOLDER_REASON: Record<Exclude<FolderCheck, { ok: true }>["reason"], string> = {
  outside_parent: "Choose a direct child of the authorized Nexyrium OS Receipts folder.",
  not_accessible: "With the drive.file scope the app cannot see this folder yet. Use “Choose folder in Google Drive” to authorize it.",
  not_a_folder: "That Drive item is not a folder.",
  read_only: "Your Google account cannot add files to that folder.",
  trashed: "That folder is in the Drive trash.",
  auth_failed: "Google Drive access was revoked or expired. Reconnect Google Drive.",
  error: "Google Drive could not be reached. Try again.",
};

/** Starts the existing Auth.js Google sign-in with the drive.file scope and offline access. */
export async function connectGoogleDrive() {
  await requirePermission(PERMISSIONS.SETTINGS_MANAGE);
  await signIn(
    "google",
    { redirectTo: `${SETTINGS_PATH}?connected=1` },
    { scope: `openid email profile ${DRIVE_FILE_SCOPE}`, access_type: "offline", prompt: "consent select_account", include_granted_scopes: "true" },
  );
}

/** Tries the configured GOOGLE_DRIVE_FOLDER_ID directly (works only if the app already has access to it). */
export async function verifyConfiguredFolder(): Promise<DriveActionState> {
  const actor = await requirePermission(PERMISSIONS.SETTINGS_MANAGE);
  const connection = await getActiveConnection();
  if (!connection) return { status: "error", message: "Connect Google Drive first." };
  const folderId = getGoogleDriveEnv().GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) return { status: "needs_picker", message: "No GOOGLE_DRIVE_FOLDER_ID is configured. Choose the folder in Google Drive." };
  const result = await checkFolderAccess(connection, folderId);
  await recordAuditEvent({ actorUserId: actor.userId, action: "integration.google_drive.folder_check", resourceType: "google_drive_connection", resourceId: connection.id, outcome: result.ok ? "success" : "failure", metadata: result.ok ? { source: "configured" } : { reason: result.reason } });
  if (!result.ok) return { status: result.reason === "not_accessible" ? "needs_picker" : "error", message: FOLDER_REASON[result.reason] };
  await saveVerifiedFolder(connection.id, result.folder);
  revalidatePath(SETTINGS_PATH);
  return { status: "success", message: `Parent folder verified: ${result.folder.name}.` };
}

/** Saves the folder chosen in Google Picker after confirming the app can now write to it. */
export async function savePickedFolder(folderId: string, category?: DriveCategory, expectedConnectionId?: string): Promise<DriveActionState> {
  const actor = await requirePermission(PERMISSIONS.SETTINGS_MANAGE);
  if (typeof folderId !== "string" || !/^[A-Za-z0-9_-]{10,200}$/.test(folderId)) return { status: "error", message: "That folder selection was not valid." };
  const connection = await getActiveConnection();
  if (!connection) return { status: "error", message: "Connect Google Drive first." };
  if (expectedConnectionId && connection.id !== expectedConnectionId) return { status: "error", message: "The connected account changed. Refresh and choose again." };
  if (category !== undefined && !driveCategories.includes(category)) return { status: "error", message: "Unknown upload category." };
  const parent = connection.folderId ?? getGoogleDriveEnv().GOOGLE_DRIVE_FOLDER_ID;
  if (category && (!parent || !connection.folderVerifiedAt)) return { status: "error", message: "Verify the receipts parent folder first." };
  if (!category && parent && folderId !== parent) return { status: "error", message: "Choose the configured receipts parent folder." };
  const result = await checkFolderAccess(connection, folderId, category ? parent ?? undefined : undefined);
  await recordAuditEvent({ actorUserId: actor.userId, action: "integration.google_drive.folder_check", resourceType: "google_drive_connection", resourceId: connection.id, outcome: result.ok ? "success" : "failure", metadata: result.ok ? { source: "picker" } : { source: "picker", reason: result.reason } });
  if (!result.ok) return { status: "error", message: FOLDER_REASON[result.reason] };
  if (category) {
    const values = { connectionId: connection.id, category, folderId: result.folder.id, folderName: result.folder.name, configuredBy: actor.userId, verifiedAt: new Date() };
    try {
      await db.insert(driveFolderMappings).values(values).onConflictDoUpdate({ target: [driveFolderMappings.connectionId, driveFolderMappings.category], set: values });
    } catch {
      return { status: "error", message: "Could not save this mapping. Check migration 0011 and choose a distinct folder for each category." };
    }
    revalidatePath(SETTINGS_PATH);
    return { status: "success", message: categoryLabel[category] + " folder saved." };
  }
  await saveVerifiedFolder(connection.id, result.folder);
  revalidatePath(SETTINGS_PATH);
  return { status: "success", message: `Parent folder verified: ${result.folder.name}.` };
}

export async function disconnectGoogleDrive(): Promise<DriveActionState> {
  const actor = await requirePermission(PERMISSIONS.SETTINGS_MANAGE);
  const connection = await getActiveConnection();
  if (!connection) return { status: "success", message: "Google Drive is already disconnected." };
  await revokeConnection(connection);
  await recordAuditEvent({ actorUserId: actor.userId, action: "integration.google_drive.disconnect", resourceType: "google_drive_connection", resourceId: connection.id, outcome: "success" });
  revalidatePath(SETTINGS_PATH);
  return { status: "success", message: "Google Drive was disconnected. Existing receipt records are kept." };
}
