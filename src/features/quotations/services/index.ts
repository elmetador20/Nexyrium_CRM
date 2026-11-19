import { eq } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs, quotationLines, quotationVersions, quotations } from "@/db/schema";
import type { AuthorizationActor } from "@/lib/authorization/policy";
import { can } from "@/lib/authorization/policy";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { financeScope } from "@/features/finance/shared/scope";
import { FinanceError } from "@/features/finance/shared/errors";
import { calculateLine, calculateTotals } from "@/features/finance/shared/money";
import { allocateNumber, getQuotation, listQuotations } from "@/features/finance/shared/repository";
import { snapshotHash, validateFinanceLinks } from "@/features/finance/shared/validation";
import { quotationCreateSchema, quotationListSchema, quotationRevisionSchema, quotationTransitionSchema } from "../schemas";

const transitions: Record<string, string[]> = {
  draft: ["submitted", "canceled"],
  submitted: ["approved", "rejected", "draft", "canceled"],
  approved: ["sent", "canceled"],
  rejected: ["draft", "canceled"],
  sent: ["accepted", "expired", "canceled"],
  accepted: ["canceled"],
  expired: ["draft", "canceled"],
  canceled: [],
};

function buildLineValues(lines: ReturnType<typeof quotationCreateSchema.parse>["lines"]) {
  return lines.map((line, index) => {
    const totals = calculateLine(line);
    return { ...line, position: index, ...totals };
  });
}

function buildSnapshot(quotation: typeof quotations.$inferSelect, lines: Array<typeof quotationLines.$inferSelect>, revision: number) {
  return { type: "quotation", id: quotation.id, number: quotation.quotationNumber, revision, title: quotation.title, notes: quotation.notes, paymentTerms: quotation.paymentTerms, dueDate: quotation.dueDate, clientId: quotation.clientId, dealId: quotation.dealId, projectId: quotation.projectId, currencyCode: quotation.currencyCode, subtotalMinor: quotation.subtotalMinor, discountMinor: quotation.discountMinor, taxMinor: quotation.taxMinor, totalMinor: quotation.totalMinor, lines } satisfies Record<string, unknown>;
}

export function createQuotationService() {
  return {
    async list(actor: AuthorizationActor, rawInput: unknown) {
      if (!can(actor, PERMISSIONS.QUOTATIONS_READ)) throw new FinanceError("FORBIDDEN", "You cannot read quotations.");
      const input = quotationListSchema.parse(rawInput);
      return listQuotations(input, financeScope(actor));
    },
    async get(actor: AuthorizationActor, id: string) {
      if (!can(actor, PERMISSIONS.QUOTATIONS_READ)) throw new FinanceError("FORBIDDEN", "You cannot read quotations.");
      const result = await getQuotation(id, financeScope(actor));
      if (!result) throw new FinanceError("NOT_FOUND", "Quotation not found.");
      return result;
    },
    async create(actor: AuthorizationActor, rawInput: unknown, correlationId?: string) {
      if (!can(actor, PERMISSIONS.QUOTATIONS_CREATE)) throw new FinanceError("FORBIDDEN", "You cannot create quotations.");
      const input = quotationCreateSchema.parse(rawInput);
      const links = await validateFinanceLinks(actor, input);
      const lines = buildLineValues(input.lines);
      const totals = calculateTotals(input.lines);
      const ownerId = input.ownerId ?? actor.userId;
      const departmentId = input.departmentId ?? actor.departmentIds[0] ?? null;
      const [quotation] = await db.insert(quotations).values({ title: input.title, notes: input.notes ?? null, paymentTerms: input.paymentTerms ?? null, dueDate: input.dueDate?.toISOString().slice(0, 10) ?? null, currencyCode: input.currencyCode, clientId: links.client.id, dealId: input.dealId ?? null, projectId: input.projectId ?? null, ownerId, departmentId, createdByUserId: actor.userId, ...totals }).returning();
      if (!quotation) throw new FinanceError("INVALID", "Quotation could not be created.");
      await db.insert(quotationLines).values(lines.map((line) => ({ quotationId: quotation.id, position: line.position, description: line.description, quantity: line.quantity, unitPriceMinor: line.unitPriceMinor, discountBps: line.discountBps, taxBps: line.taxBps, lineSubtotalMinor: line.grossMinor, lineDiscountMinor: line.discountMinor, lineTaxMinor: line.taxMinor, lineTotalMinor: line.totalMinor })));
      await db.insert(auditLogs).values({ actorUserId: actor.userId, action: "quotation.create", resourceType: "quotation", resourceId: quotation.id, outcome: "success", correlationId: correlationId ?? null, metadata: { totalMinor: quotation.totalMinor, currencyCode: quotation.currencyCode } });
      return quotation;
    },
    async transition(actor: AuthorizationActor, id: string, rawInput: unknown, correlationId?: string) {
      const input = quotationTransitionSchema.parse(rawInput);
      const current = await getQuotation(id, financeScope(actor));
      if (!current) throw new FinanceError("NOT_FOUND", "Quotation not found.");
      const canApprove = ["approved", "rejected"].includes(input.status) ? can(actor, PERMISSIONS.QUOTATIONS_APPROVE) : can(actor, PERMISSIONS.QUOTATIONS_UPDATE);
      if (!canApprove) throw new FinanceError("FORBIDDEN", "You cannot perform this quotation transition.");
      if (!transitions[current.quotation.status]?.includes(input.status)) throw new FinanceError("CONFLICT", `Quotation cannot move from ${current.quotation.status} to ${input.status}.`);
      await db.transaction(async (tx) => {
        let quotationNumber = current.quotation.quotationNumber;
        let issuedAt = current.quotation.issuedAt;
        let revision = current.quotation.revision;
        if (input.status === "submitted" && !quotationNumber) quotationNumber = (await allocateNumber(tx, "quotation", "QT")).number;
        if (["submitted", "approved", "sent"].includes(input.status)) {
          revision = Math.max(1, revision);
          const snapshot = buildSnapshot({ ...current.quotation, quotationNumber }, current.lines, revision);
          await tx.insert(quotationVersions).values({ quotationId: id, revision, snapshot, snapshotHash: snapshotHash(snapshot), createdByUserId: actor.userId });
        }
        if (input.status === "sent") issuedAt = issuedAt ?? new Date();
        await tx.update(quotations).set({ status: input.status as typeof quotations.$inferInsert.status, quotationNumber, revision, issuedAt, updatedAt: new Date() }).where(eq(quotations.id, id));
        await tx.insert(auditLogs).values({ actorUserId: actor.userId, action: `quotation.${input.status}`, resourceType: "quotation", resourceId: id, outcome: "success", correlationId: correlationId ?? null, metadata: { fromStatus: current.quotation.status, toStatus: input.status, revision, quotationNumber } });
      });
      return (await getQuotation(id, financeScope(actor)))!.quotation;
    },
    async revise(actor: AuthorizationActor, id: string, rawInput: unknown, correlationId?: string) {
      if (!can(actor, PERMISSIONS.QUOTATIONS_REVISE)) throw new FinanceError("FORBIDDEN", "You cannot revise quotations.");
      const current = await getQuotation(id, financeScope(actor));
      if (!current) throw new FinanceError("NOT_FOUND", "Quotation not found.");
      if (!["approved", "sent", "accepted", "expired"].includes(current.quotation.status)) throw new FinanceError("CONFLICT", "Only submitted quotations can be revised.");
      const input = quotationRevisionSchema.parse(rawInput);
      const lines = buildLineValues(input.lines);
      const totals = calculateTotals(input.lines);
      await db.transaction(async (tx) => {
        const revision = current.quotation.revision + 1;
        await tx.delete(quotationLines).where(eq(quotationLines.quotationId, id));
        await tx.insert(quotationLines).values(lines.map((line) => ({ quotationId: id, position: line.position, description: line.description, quantity: line.quantity, unitPriceMinor: line.unitPriceMinor, discountBps: line.discountBps, taxBps: line.taxBps, lineSubtotalMinor: line.grossMinor, lineDiscountMinor: line.discountMinor, lineTaxMinor: line.taxMinor, lineTotalMinor: line.totalMinor })));
        await tx.update(quotations).set({ title: input.title, notes: input.notes ?? null, paymentTerms: input.paymentTerms ?? null, dueDate: input.dueDate?.toISOString().slice(0, 10) ?? null, currencyCode: input.currencyCode, ...totals, revision, status: "draft", updatedAt: new Date() }).where(eq(quotations.id, id));
        await tx.insert(auditLogs).values({ actorUserId: actor.userId, action: "quotation.revise", resourceType: "quotation", resourceId: id, outcome: "success", correlationId: correlationId ?? null, metadata: { previousRevision: current.quotation.revision, revision } });
      });
      return (await getQuotation(id, financeScope(actor)))!.quotation;
    },
  };
}
