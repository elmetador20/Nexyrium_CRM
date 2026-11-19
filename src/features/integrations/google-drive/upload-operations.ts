import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { drive_v3 } from "googleapis";

import { db } from "@/db";
import { driveUploads } from "@/db/schema";
import { StorageError } from "@/lib/storage";
import type { DriveCategory } from "./categories";

export async function reserveUpload(connectionId: string, category: DriveCategory, key: string, folderId: string, drive: drive_v3.Drive) {
  const operationKey = createHash("sha256").update(key).digest("hex");
  const where = and(eq(driveUploads.connectionId, connectionId), eq(driveUploads.category, category), eq(driveUploads.operationKey, operationKey));
  const lookup = async () => (await db.select().from(driveUploads).where(where).limit(1))[0];
  let row = await lookup();
  if (!row) {
    const { data } = await drive.files.generateIds({ count: 1, space: "drive" });
    const fileId = data.ids?.[0];
    if (!fileId) throw new StorageError("UPLOAD_FAILED", "Google Drive could not reserve a file ID.");
    await db.insert(driveUploads).values({ connectionId, category, operationKey, folderId, fileId }).onConflictDoNothing();
    row = await lookup();
  }
  if (!row || row.folderId !== folderId) throw new StorageError("ACCESS_DENIED", "The destination changed during this upload. Restore its original mapping to retry.", 409);
  return { fileId: row.fileId, complete: () => db.update(driveUploads).set({ uploadedAt: new Date() }).where(where) };
}
