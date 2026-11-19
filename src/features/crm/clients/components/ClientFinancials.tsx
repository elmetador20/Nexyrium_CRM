import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { users, departments, invoices, payments, paymentAllocations } from "@/db/schema";
import { can, type AuthorizationActor } from "@/lib/authorization/policy";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { financeScope } from "@/features/finance/shared/scope";
import { scopeCondition } from "@/features/finance/shared/repository";
import { formatMinor } from "@/lib/format";
import { Panel, PanelLink, StatCard } from "@/components/nx";

export async function clientLabels(ownerId:string|null, departmentId:string|null) {
  const [owners, teams] = await Promise.all([
    ownerId ? db.select({name:users.name,email:users.email}).from(users).where(eq(users.id,ownerId)) : [],
    departmentId ? db.select({name:departments.name}).from(departments).where(eq(departments.id,departmentId)) : []
  ]);
  return {owner:owners[0]?.name || owners[0]?.email || "Unassigned",department:teams[0]?.name || "Unassigned"};
}

export async function ClientFinancials({id,actor}:{id:string;actor:AuthorizationActor}) {
  if (!can(actor,PERMISSIONS.INVOICES_READ) || !can(actor,PERMISSIONS.PAYMENTS_READ)) return null;
  const scope = financeScope(actor);
  const allocated = db.select({id:paymentAllocations.invoiceId,paid:sql<string>`sum(${paymentAllocations.allocatedAmountMinor})`.as("allocated")})
    .from(paymentAllocations).innerJoin(payments,eq(payments.id,paymentAllocations.paymentId))
    .innerJoin(invoices,eq(invoices.id,paymentAllocations.invoiceId))
    .where(and(eq(payments.status,"posted"),eq(invoices.clientId,id),scopeCondition(invoices,scope))).groupBy(paymentAllocations.invoiceId).as("applied");
  const [bills,receipts]=await Promise.all([
    db.select({currency:invoices.currencyCode,billed:sql<string>`sum(${invoices.totalMinor})`,due:sql<string>`sum(greatest(0,${invoices.totalMinor}-coalesce(${allocated.paid},0)))`})
      .from(invoices).leftJoin(allocated,eq(allocated.id,invoices.id)).where(and(scopeCondition(invoices,scope),eq(invoices.clientId,id),inArray(invoices.status,["issued","partially_paid","paid","overdue"]))).groupBy(invoices.currencyCode),
    db.select({currency:payments.currencyCode,amount:sql<string>`sum(${payments.amountMinor})`}).from(payments).where(and(scopeCondition(payments,scope),eq(payments.clientId,id),eq(payments.status,"posted"))).groupBy(payments.currencyCode)
  ]);
  const currencies=[...new Set([...bills,...receipts].map(row=>row.currency))];
  return <Panel title="Client account" description="Issued invoices, posted payments and remaining balance" action={<PanelLink href={"/finance/invoices?clientId="+id}>Invoices</PanelLink>}>
    {currencies.length ? <div className="space-y-3">{currencies.map(currency=>{
      const b=bills.find(r=>r.currency===currency),r=receipts.find(r=>r.currency===currency);
      return <div className="grid gap-3 sm:grid-cols-3" key={currency}>
        <StatCard label={"Invoiced · "+currency} value={formatMinor(b?.billed || "0",currency)} tone="info" href={"/finance/invoices?clientId="+id} />
        <StatCard label="Received" value={formatMinor(r?.amount || "0",currency)} tone="primary" hint="Posted payments, incl. advances" href={"/finance/payments?clientId="+id} />
        <StatCard label="Outstanding" value={formatMinor(b?.due || "0",currency)} tone={BigInt(b?.due || "0") > BigInt(0) ? "warning" : "success"} href={"/finance/invoices?status=outstanding&clientId="+id} />
      </div>;
    })}</div> : <p className="text-sm text-text-muted">No issued invoices or posted payments for this client yet.</p>}
  </Panel>;
}
