import { createHash } from "node:crypto";

import { attachmentId } from "@/features/integrations/google-drive/attachment-id";
import { and, ne, eq } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs, documentStorageObjects, documents, expenseReceipts } from "@/db/schema";
import type { AuthorizationActor } from "@/lib/authorization/policy";
import { can } from "@/lib/authorization/policy";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import type { StorageAdapter } from "@/lib/storage";
import { StorageError } from "@/lib/storage";
import { AccountingError } from "../errors";
import { expenseScope } from "../scope";
import { getExpense } from "../queries";
import { RECEIPT_MAX_BYTES, validateReceiptFile } from "../receipt-file";

type ReceiptFile = { name: string; type: string; size: number; arrayBuffer(): Promise<ArrayBuffer> };

function safeFilename(name: string) {
  const basename = name.replace(/\\/g, "/").split("/").pop() ?? "receipt";
  const cleaned = basename.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, "").replace(/[<>:"|?*]/g, "_").trim().replace(/^\.+/, "").slice(0, 200);
  return cleaned || "receipt";
}

function mapStorageError(error: unknown) {
  if (!(error instanceof StorageError)) return new AccountingError("STORAGE_UNAVAILABLE", "The receipt could not be stored. Try again.");
  // These messages are written for users and contain no provider or credential details.
  if (error.code === "CONFIGURATION_MISSING" || error.code === "AUTHENTICATION_FAILED" || (error.code === "ACCESS_DENIED" && error.status === 503)) return new AccountingError("STORAGE_UNAVAILABLE", error.message);
  if (error.code === "ACCESS_DENIED") return new AccountingError("STORAGE_UNAVAILABLE", "Google Drive refused access to the receipts folder. Re-authorize the folder in Settings → Integrations → Google Drive.");
  if (error.code === "NOT_FOUND") return new AccountingError("STORAGE_UNAVAILABLE", "The receipts folder or file was not found in Google Drive. Re-authorize the folder in Settings → Integrations → Google Drive.");
  if (error.code === "QUOTA_EXCEEDED") return new AccountingError("STORAGE_UNAVAILABLE", "Google Drive storage or rate limit was reached. Try again later.");
  return new AccountingError("STORAGE_UNAVAILABLE", "Google Drive could not complete the request. Try again.");
}

export function createExpenseReceiptService(input: { storageFactory: () => StorageAdapter; maxFileBytes: number; allowedMimeTypes: Set<string> }) {
  return {
    async upload(actor: AuthorizationActor, expenseId: string, file: ReceiptFile, correlationId?: string) {
      if (!can(actor, PERMISSIONS.EXPENSES_RECEIPTS_UPLOAD)) throw new AccountingError("FORBIDDEN", "You cannot upload expense receipts.");
      const current = await getExpense(expenseId, expenseScope(actor));
      if (!current) throw new AccountingError("NOT_FOUND", "Expense not found.");
      if (!["draft", "submitted"].includes(current.expense.status)) throw new AccountingError("CONFLICT", "Receipts can only be attached to draft or submitted expenses.");
      const maxBytes = Math.min(input.maxFileBytes, RECEIPT_MAX_BYTES);
      if (file.size > maxBytes) throw new AccountingError("INVALID", `Receipts must be ${Math.floor(maxBytes / (1024 * 1024))} MB or smaller.`);
      const filename = safeFilename(file.name);
      const body = Buffer.from(await file.arrayBuffer());
      const validation = validateReceiptFile({ type: file.type, size: file.size }, body, maxBytes);
      if (!validation.ok) throw new AccountingError("INVALID", validation.message);
      if (!input.allowedMimeTypes.has(validation.mimeType)) throw new AccountingError("INVALID", "This receipt file type is not allowed.");
      const mimeType = validation.mimeType;
      const checksum = createHash("sha256").update(body).digest("hex");
      const id = attachmentId("expense", expenseId, checksum);
      const [document] = await db.transaction(async (tx) => {
        const [created] = await tx.insert(documents).values({ id, title: filename, originalFilename: filename, mimeType: mimeType, sizeBytes: body.byteLength, checksum, category: "expense_receipt", status: "pending", ownerId: current.expense.ownerId, departmentId: current.expense.departmentId, createdByUserId: actor.userId, updatedByUserId: actor.userId }).onConflictDoUpdate({ target: documents.id, set: { id } }).returning();
        if (!created) throw new AccountingError("INVALID", "Receipt metadata could not be created.");
        await tx.insert(expenseReceipts).values({ expenseId, documentId: created.id, uploadedByUserId: actor.userId }).onConflictDoNothing();
        return [created] as const;
      });
      if (document.status === "available") {
        const [object] = await db.select().from(documentStorageObjects).where(eq(documentStorageObjects.documentId, id));
        const link = object?.providerMetadata?.webViewLink;
        return { ...document, contentUrl: `/api/v1/expenses/${expenseId}/receipts/${id}/content`, driveUrl: typeof link === "string" ? link : null };
      }
      let uploaded: Awaited<ReturnType<StorageAdapter["upload"]>> | null = null;
      try {
        uploaded = await input.storageFactory().upload({ category: "expense", operationKey: id, filename, mimeType: mimeType, body });
        const [available] = await db.transaction(async (tx) => {
          await tx.insert(documentStorageObjects).values({ documentId: document.id, provider: uploaded!.provider, providerObjectId: uploaded!.objectId, providerParentId: uploaded!.parentId, providerRevision: uploaded!.revision, providerEtag: uploaded!.etag, checksum: uploaded!.checksum, sizeBytes: uploaded!.sizeBytes, status: "uploaded", providerMetadata: uploaded!.metadata, lastSyncedAt: new Date() }).onConflictDoNothing();
          const [updated] = await tx.update(documents).set({ status: "available", failureCode: null, failureMessage: null, updatedByUserId: actor.userId, updatedAt: new Date() }).where(eq(documents.id, document.id)).returning();
          await tx.insert(auditLogs).values({ actorUserId: actor.userId, action: "expense.receipt.upload", resourceType: "expense", resourceId: expenseId, outcome: "success", correlationId: correlationId ?? null, metadata: { documentId: document.id, mimeType: mimeType, sizeBytes: body.byteLength } });
          return [updated] as const;
        });
        const driveUrl = typeof uploaded.metadata.webViewLink === "string" ? uploaded.metadata.webViewLink : null;
        return { ...available, contentUrl: `/api/v1/expenses/${expenseId}/receipts/${document.id}/content`, driveUrl };
      } catch (error) {
        await db.update(documents).set({ status: "failed", failureCode: error instanceof StorageError ? error.code : "UPLOAD_FAILED", failureMessage: error instanceof Error ? error.message : "Receipt upload failed.", updatedByUserId: actor.userId, updatedAt: new Date() }).where(and(eq(documents.id, document.id), ne(documents.status, "available")));
        await db.insert(auditLogs).values({ actorUserId: actor.userId, action: "expense.receipt.upload", resourceType: "expense", resourceId: expenseId, outcome: "failure", correlationId: correlationId ?? null, metadata: { documentId: document.id } });
        throw mapStorageError(error);
      }
    },

    async download(actor: AuthorizationActor, expenseId: string, documentId: string, correlationId?: string) {
      if (!can(actor, PERMISSIONS.EXPENSES_READ)) throw new AccountingError("FORBIDDEN", "You cannot read expense receipts.");
      const current = await getExpense(expenseId, expenseScope(actor));
      if (!current) throw new AccountingError("NOT_FOUND", "Expense not found.");
      const receipt = current.receipts.find((item) => item.document.id === documentId);
      if (!receipt || receipt.document.status !== "available" || !receipt.storage) throw new AccountingError("NOT_FOUND", "Receipt not found.");
      try {
        const download = await input.storageFactory().download(receipt.storage.providerObjectId);
        await db.insert(auditLogs).values({ actorUserId: actor.userId, action: "expense.receipt.download", resourceType: "expense", resourceId: expenseId, outcome: "success", correlationId: correlationId ?? null, metadata: { documentId } });
        return download;
      } catch (error) {
        throw mapStorageError(error);
      }
    },
  };
}
