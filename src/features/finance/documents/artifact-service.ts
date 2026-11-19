import { createHash } from "node:crypto";
import { StorageError } from "@/lib/storage";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { financialArtifacts } from "@/db/schema";
import type { StorageAdapter } from "@/lib/storage";
import { FinanceError } from "../shared/errors";
import { renderFinancialPdf, type FinancialPdfInput } from "./pdf";

export const generateDownload = renderFinancialPdf;

export async function generateFinancialPdf(input: { actorUserId: string; quotationId?: string; invoiceId?: string; data: FinancialPdfInput; storage: StorageAdapter }) {
  if (!input.quotationId && !input.invoiceId) throw new FinanceError("INVALID", "A financial document reference is required.");
  const rendered = await renderFinancialPdf(input.data);
  const category = input.invoiceId ? "invoice" : "quotation";
  const md5 = createHash("md5").update(rendered.body).digest("hex");
  const verify = (objectId: string) => {
    if (!input.storage.verifyDestination) throw new StorageError("UPLOAD_FAILED", "Drive file verification is unavailable.");
    return input.storage.verifyDestination(category, objectId, md5);
  };
  const lookup = async () => (await db.select().from(financialArtifacts).where(and(eq(financialArtifacts.checksum, rendered.checksum), input.quotationId ? eq(financialArtifacts.quotationId, input.quotationId) : isNull(financialArtifacts.quotationId), input.invoiceId ? eq(financialArtifacts.invoiceId, input.invoiceId) : isNull(financialArtifacts.invoiceId))).limit(1))[0];
  const existing = await lookup();
  if (existing && await verify(existing.providerObjectId)) return existing;
  // Retries replacing the same stale object share a reservation. A later loss
  // of the replacement has its own key, derived from its different Drive ID.
  const identity = [input.invoiceId ?? input.quotationId, rendered.checksum];
  if (existing) identity.push(existing.providerObjectId);
  const stored = await input.storage.upload({ category, operationKey: JSON.stringify(identity), filename: rendered.filename, mimeType: rendered.mimeType, body: rendered.body });
  if (!await verify(stored.objectId)) throw new StorageError("UPLOAD_FAILED", "Could not confirm the PDF in its mapped Drive folder. Retry the save.");
  if (existing) {
    const [updated] = await db.update(financialArtifacts).set({ providerObjectId: stored.objectId, status: "available" }).where(and(
      eq(financialArtifacts.id, existing.id), eq(financialArtifacts.providerObjectId, existing.providerObjectId),
    )).returning();
    if (updated) return updated;
    const current = await lookup();
    if (current && await verify(current.providerObjectId)) return current;
    throw new StorageError("UPLOAD_FAILED", "The saved PDF changed during recovery. Retry the save.");
  }
  const [artifact] = await db.insert(financialArtifacts).values({ quotationId: input.quotationId ?? null, invoiceId: input.invoiceId ?? null, artifactType: input.data.documentType, rendererVersion: rendered.rendererVersion, checksum: rendered.checksum, provider: stored.provider, providerObjectId: stored.objectId, filename: rendered.filename, status: "available", createdByUserId: input.actorUserId }).onConflictDoNothing().returning();
  if (!artifact) {
    const [concurrent] = await db.select().from(financialArtifacts).where(eq(financialArtifacts.providerObjectId, stored.objectId)).limit(1);
    if (concurrent && await verify(concurrent.providerObjectId) && concurrent.invoiceId === (input.invoiceId ?? null) && concurrent.quotationId === (input.quotationId ?? null)) return concurrent;
  }
  if (!artifact) throw new FinanceError("INVALID", "Financial PDF artifact could not be recorded.");
  return artifact;
}

export async function getFinancialArtifact(id: string) {
  const [artifact] = await db.select().from(financialArtifacts).where(eq(financialArtifacts.id, id)).limit(1);
  return artifact ?? null;
}
