"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, invoices, payments, paymentAllocations } from "@/db/schema";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { requirePermission } from "@/lib/authorization/server";
import { scopeCondition } from "@/features/finance/shared/repository";
import { financeScope } from "@/features/finance/shared/scope";

export async function applyAdvance(_: string, form: FormData) {
  const actor = await requirePermission(PERMISSIONS.PAYMENTS_ALLOCATE);
  const ids = z.object({invoice: z.string().uuid(), payment: z.string().uuid()}).safeParse(Object.fromEntries(form));
  if (!ids.success) return "Select an advance.";
  const scope = financeScope(actor);
  const result = await db.transaction(async tx => {
    const [p] = await tx.select().from(payments).where(and(eq(payments.id,ids.data.payment),scopeCondition(payments,scope))).for("update");
    const [i] = await tx.select().from(invoices).where(and(eq(invoices.id,ids.data.invoice),scopeCondition(invoices,scope))).for("update");
    if (!p || !i || p.status !== "posted" || p.clientId !== i.clientId || p.currencyCode !== i.currencyCode) return "This advance is unavailable for the invoice.";
    if (!["issued","partially_paid","overdue"].includes(i.status)) return "Only an open issued invoice can receive an advance.";
    const sum = sql<string>`coalesce(sum(${paymentAllocations.allocatedAmountMinor}),0)`;
    const [used] = await tx.select({amount:sum}).from(paymentAllocations).where(eq(paymentAllocations.paymentId,p.id));
    const [paid] = await tx.select({amount:sum}).from(paymentAllocations).innerJoin(payments,eq(payments.id,paymentAllocations.paymentId)).where(and(eq(paymentAllocations.invoiceId,i.id),eq(payments.status,"posted")));
    const available = BigInt(p.amountMinor)-BigInt(used.amount);
    const due = BigInt(i.totalMinor)-BigInt(paid.amount);
    const amount = available < due ? available : due;
    if (amount <= BigInt(0)) return "No unused credit or outstanding balance remains.";
    await tx.insert(paymentAllocations).values({invoiceId:i.id,paymentId:p.id,allocatedByUserId:actor.userId,allocatedAmountMinor:amount.toString()});
    await tx.update(invoices).set({status:amount===due?"paid":"partially_paid",updatedAt:new Date()}).where(eq(invoices.id,i.id));
    await tx.insert(auditLogs).values({actorUserId:actor.userId,resourceType:"invoice",resourceId:i.id,action:"payment.allocate",outcome:"success",metadata:{paymentId:p.id,allocatedMinor:amount.toString()}});
    return "Advance applied.";
  });
  revalidatePath("/finance/invoices/"+ids.data.invoice);
  return result;
}
