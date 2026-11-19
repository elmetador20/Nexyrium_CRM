import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs, invoices, paymentAllocations, payments } from "@/db/schema";
import type { AuthorizationActor } from "@/lib/authorization/policy";
import { can } from "@/lib/authorization/policy";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { FinanceError } from "@/features/finance/shared/errors";
import { addMinor, parseMinor, subtractMinor } from "@/features/finance/shared/money";
import { financeScope } from "@/features/finance/shared/scope";
import { scopeCondition } from "@/features/finance/shared/repository";
import { validateFinanceLinks } from "@/features/finance/shared/validation";
import { paymentCreateSchema, paymentListSchema } from "../schemas";

export function createPaymentService() {
  return {
    async create(actor: AuthorizationActor, rawInput: unknown, correlationId?: string) {
      if (!can(actor, PERMISSIONS.PAYMENTS_CREATE)) throw new FinanceError("FORBIDDEN", "You cannot record payments.");
      const input = paymentCreateSchema.parse(rawInput);
      const scope = financeScope(actor);
      const { client } = await validateFinanceLinks(actor, { clientId: input.clientId });
      if (input.departmentId && scope.kind !== "global" && !actor.departmentIds.includes(input.departmentId)) throw new FinanceError("FORBIDDEN", "Select a department you belong to.");
      if (input.allocations.length > 0 && !can(actor, PERMISSIONS.PAYMENTS_ALLOCATE)) throw new FinanceError("FORBIDDEN", "You cannot allocate payments.");
      const payloadHash = JSON.stringify(input);
      return db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${input.idempotencyKey}, 0))`);
        const [existing] = await tx.select().from(payments).where(eq(payments.idempotencyKey, input.idempotencyKey)).limit(1);
        if (existing) {
          if (existing.createdByUserId !== actor.userId || existing.amountMinor !== input.amountMinor || existing.clientId !== input.clientId || existing.currencyCode !== input.currencyCode || existing.paymentMethod !== input.paymentMethod || existing.externalReference !== (input.externalReference ?? null) || existing.receivedAt.getTime() !== input.receivedAt.getTime()) throw new FinanceError("IDEMPOTENCY_CONFLICT", "Payment idempotency key was reused with different data.");
          return existing;
        }
        const [firstInvoice] = input.allocations.length ? await tx.select({departmentId: invoices.departmentId}).from(invoices)
          .where(and(eq(invoices.id, input.allocations[0].invoiceId), eq(invoices.clientId,input.clientId),scopeCondition(invoices,scope))).limit(1) : [];
        const departmentId = input.departmentId ?? firstInvoice?.departmentId ?? client.departmentId ?? actor.departmentIds[0] ?? null;
        const [payment] = await tx.insert(payments).values({ status:input.status, clientId: input.clientId, amountMinor: input.amountMinor, currencyCode: input.currencyCode, receivedAt: input.receivedAt, paymentMethod: input.paymentMethod, externalReference: input.externalReference ?? null, idempotencyKey: input.idempotencyKey, ownerId: actor.userId, departmentId, createdByUserId: actor.userId }).returning();
        if (!payment) throw new FinanceError("INVALID", "Payment could not be recorded.");
        let allocated = "0";
        for (const allocation of input.allocations) {
          const [invoice] = await tx.select().from(invoices).where(and(eq(invoices.id, allocation.invoiceId), scopeCondition(invoices, scope))).limit(1).for("update");
          if (!invoice || invoice.clientId !== input.clientId) throw new FinanceError("CONFLICT", "Payment allocation does not match the invoice client.");
          if (invoice.currencyCode !== input.currencyCode) throw new FinanceError("CONFLICT", "Payment and invoice currencies must match.");
          if (!["issued", "partially_paid", "overdue"].includes(invoice.status)) throw new FinanceError("CONFLICT", "Payments can only be allocated to issued invoices.");
          const [{ paid }] = await tx.select({ paid: sql<string>`coalesce(sum(${paymentAllocations.allocatedAmountMinor}), 0)` }).from(paymentAllocations).innerJoin(payments, eq(payments.id, paymentAllocations.paymentId)).where(and(eq(paymentAllocations.invoiceId, invoice.id), eq(payments.status, "posted")));
          const outstanding = subtractMinor(invoice.totalMinor, paid ?? "0");
          const amount = parseMinor(allocation.amountMinor);
          if (amount <= BigInt(0) || amount > parseMinor(outstanding)) throw new FinanceError("CONFLICT", "Payment allocation exceeds the invoice balance.");
          allocated = addMinor(allocated, allocation.amountMinor);
          await tx.insert(paymentAllocations).values({ paymentId: payment.id, invoiceId: invoice.id, allocatedAmountMinor: allocation.amountMinor, allocatedByUserId: actor.userId });
          const newPaid = addMinor(paid ?? "0", allocation.amountMinor);
           await tx.update(invoices).set({ status: newPaid === invoice.totalMinor ? "paid" : "partially_paid", updatedAt: new Date() }).where(and(eq(invoices.id, invoice.id), inArray(invoices.status, ["issued", "partially_paid", "overdue"])));
        }
        if (parseMinor(allocated) > parseMinor(payment.amountMinor)) throw new FinanceError("CONFLICT", "Payment allocations exceed the payment amount.");
        await tx.insert(auditLogs).values({ actorUserId: actor.userId, action: "payment.record", resourceType: "payment", resourceId: payment.id, outcome: "success", correlationId: correlationId ?? null, metadata: { clientId: input.clientId, amountMinor: payment.amountMinor, currencyCode: payment.currencyCode, allocationCount: input.allocations.length, payloadHash } });
        return payment;
      });
    },
    async list(actor: AuthorizationActor, rawInput?: unknown) {
      if (!can(actor, PERMISSIONS.PAYMENTS_READ)) throw new FinanceError("FORBIDDEN", "You cannot read payments.");
      const { clientId } = paymentListSchema.parse({ clientId: typeof rawInput === "string" ? rawInput : (rawInput as { clientId?: string } | undefined)?.clientId });
      const scope = financeScope(actor);
      const condition = clientId ? eq(payments.clientId, clientId) : undefined;
      const rows = await db.select().from(payments).where(and(condition, scopeCondition(payments,scope)));
      return rows;
    },
  };
}
