import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { AdvanceAllocation } from "./AdvanceAllocation";
import { scopeCondition } from "../shared/repository";
import { can } from "@/lib/authorization/policy";
import { departments, payments, paymentAllocations } from "@/db/schema";
import { requirePagePermission } from "@/lib/authorization/server";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { financeScope } from "../shared/scope";
import { PaymentEntry, type PaymentFormProps } from "./PaymentEntry";

export async function InvoicePaymentForm(props: PaymentFormProps) {
  const actor = await requirePagePermission(PERMISSIONS.PAYMENTS_CREATE);
  const all = financeScope(actor).kind === "global";
  const options = all || actor.departmentIds.length ? await db.select({id: departments.id, name: departments.name})
    .from(departments).where(all ? undefined : inArray(departments.id,actor.departmentIds)).orderBy(asc(departments.name)) : [];
  const available = sql<string>`${payments.amountMinor} - coalesce(sum(${paymentAllocations.allocatedAmountMinor}),0)`;
  const advances = props.invoiceId && props.clientId && props.currencyCode && can(actor,PERMISSIONS.PAYMENTS_ALLOCATE) && can(actor,PERMISSIONS.PAYMENTS_READ)
    ? await db.select({id:payments.id,date:payments.receivedAt,available}).from(payments)
      .leftJoin(paymentAllocations,eq(paymentAllocations.paymentId,payments.id))
      .where(and(scopeCondition(payments,financeScope(actor)),eq(payments.clientId,props.clientId),eq(payments.currencyCode,props.currencyCode),eq(payments.status,"posted")))
      .groupBy(payments.id).having(sql`${available} > 0`).orderBy(asc(payments.receivedAt)) : [];
  return <>{props.invoiceId && props.currencyCode && advances.length > 0 && <AdvanceAllocation invoiceId={props.invoiceId} currency={props.currencyCode} options={advances.map(r=>({...r,date:r.date.toISOString().slice(0,10)}))}/>}
    <PaymentEntry {...props} departments={options}/></>;
}
