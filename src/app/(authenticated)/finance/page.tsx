import { DashboardReportView } from "@/features/reports/components/DashboardReportView";
import { reportsService } from "@/features/reports/server";
import Link from "next/link";

import { invoiceService } from "@/features/finance/server";
import { formatMoney, subtractMinor } from "@/features/finance/shared/money";
import { can } from "@/lib/authorization/policy";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { requirePageActor } from "@/lib/authorization/server";

export const instant = false;

export default async function FinancePage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const actor = await requirePageActor();
  if (can(actor,PERMISSIONS.REPORTS_READ) && can(actor,PERMISSIONS.FINANCE_READ)) return <DashboardReportView action="/finance" data={await reportsService.dashboard(actor,await searchParams)}/>;
  if (!can(actor, PERMISSIONS.FINANCE_READ) && !can(actor, PERMISSIONS.INVOICES_READ)) {
    return <section className="card p-8"><h1 className="text-xl font-semibold text-text-primary">Finance is unavailable</h1><p className="mt-2 text-sm text-text-secondary">You do not have permission to view finance records.</p></section>;
  }

  const result = await invoiceService.list(actor, { page: 1, pageSize: 100 });
  const today = new Date().toISOString().slice(0, 10);
  const byCurrency = new Map<string, { invoiced: string; collected: string; outstanding: string; overdue: string; drafts: string }>();

  for (const invoice of result.items) {
    const current = byCurrency.get(invoice.currencyCode) ?? { invoiced: "0", collected: "0", outstanding: "0", overdue: "0", drafts: "0" };
    const paid = invoice.paidMinor ?? "0";
    if (invoice.status === "draft") current.drafts = add(current.drafts, invoice.totalMinor);
    if (invoice.status !== "draft" && invoice.status !== "voided") {
      current.invoiced = add(current.invoiced, invoice.totalMinor);
      current.collected = add(current.collected, paid);
      const balance = subtractMinor(invoice.totalMinor, paid);
      current.outstanding = add(current.outstanding, balance);
      if (invoice.status === "overdue" || (invoice.dueDate && invoice.dueDate < today && balance !== "0")) current.overdue = add(current.overdue, balance);
    }
    byCurrency.set(invoice.currencyCode, current);
  }

  return (
    <section>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-sm font-medium text-text-muted">Financial overview</p><h1 className="mt-1 text-2xl font-semibold text-text-primary">Finance</h1><p className="mt-1 text-sm text-text-secondary">Amounts are grouped by currency and calculated from persisted invoices and payment allocations.</p></div>
        <Link className="button-primary" href="/finance/invoices/new">New invoice</Link>
      </div>
      {byCurrency.size === 0 ? <div className="card border-dashed p-10 text-center"><h2 className="font-semibold text-text-primary">No financial activity yet</h2><p className="mt-2 text-sm text-text-secondary">Create an invoice to begin tracking receivables.</p></div> : <div className="space-y-4">{[...byCurrency.entries()].map(([currency, values]) => <div className="card p-5" key={currency}><h2 className="font-semibold text-text-primary">{currency}</h2><dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5"><Metric label="Invoiced" value={formatMoney(values.invoiced, currency)} /><Metric label="Collected" value={formatMoney(values.collected, currency)} /><Metric label="Outstanding" value={formatMoney(values.outstanding, currency)} /><Metric label="Overdue" value={formatMoney(values.overdue, currency)} /><Metric label="Drafts" value={formatMoney(values.drafts, currency)} /></dl></div>)}</div>}
      <div className="mt-8"><Link className="text-sm font-medium text-primary hover:underline" href="/finance/invoices">View all invoices →</Link></div>
    </section>
  );
}

function add(left: string, right: string) {
  return (BigInt(left) + BigInt(right)).toString();
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-surface-hover p-4"><dt className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</dt><dd className="mt-2 text-lg font-semibold text-text-primary">{value}</dd></div>;
}
