import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { financialArtifacts } from "@/db/schema";
import type { StorageAdapter } from "@/lib/storage";
import { FinanceError } from "../shared/errors";
import { renderFinancialPdf, type FinancialPdfInput } from "./pdf";

export async function generateFinancialPdf(input: { actorUserId: string; quotationId?: string; invoiceId?: string; data: FinancialPdfInput; storage: StorageAdapter }) {
  if (!input.quotationId && !input.invoiceId) throw new FinanceError("INVALID", "A financial document reference is required.");
  const rendered = await renderFinancialPdf(input.data);
  const [existing] = await db.select().from(financialArtifacts).where(and(eq(financialArtifacts.checksum, rendered.checksum), input.quotationId ? eq(financialArtifacts.quotationId, input.quotationId) : isNull(financialArtifacts.quotationId), input.invoiceId ? eq(financialArtifacts.invoiceId, input.invoiceId) : isNull(financialArtifacts.invoiceId))).limit(1);
  if (existing) return existing;
  const stored = await input.storage.upload({ filename: rendered.filename, mimeType: rendered.mimeType, body: rendered.body });
  const [artifact] = await db.insert(financialArtifacts).values({ quotationId: input.quotationId ?? null, invoiceId: input.invoiceId ?? null, artifactType: input.data.documentType, rendererVersion: rendered.rendererVersion, checksum: rendered.checksum, provider: stored.provider, providerObjectId: stored.objectId, filename: rendered.filename, status: "available", createdByUserId: input.actorUserId }).returning();
  if (!artifact) throw new FinanceError("INVALID", "Financial PDF artifact could not be recorded.");
  return artifact;
}

export async function getFinancialArtifact(id: string) {
  const [artifact] = await db.select().from(financialArtifacts).where(eq(financialArtifacts.id, id)).limit(1);
  return artifact ?? null;
}
