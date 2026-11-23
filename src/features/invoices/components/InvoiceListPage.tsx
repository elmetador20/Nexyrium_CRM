import Link from "next/link";
import { FilterChip } from "@/components/nx/FilterChip";
import { FileText, Plus } from "lucide-react";

import { InvoicePaymentForm } from "@/features/finance/components/InvoicePaymentForm";
import { invoiceService } from "@/features/finance/server";
import { subtractMinor } from "@/features/finance/shared/money";
import { EmptyState, PageHeader, Panel, Pager, StatusBadge, TableCard } from "@/components/nx";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { can } from "@/lib/authorization/policy";
import { requirePagePermission } from "@/lib/authorization/server";
import { formatDate, formatMinor } from "@/lib/format";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;
const TABS = [
  { key: undefined, label: "All" },
  { key: "draft", label: "Draft" },
  { key: "outstanding", label: "Outstanding" },
  { key: "overdue", label: "Overdue" },
  { key: "partially_paid", label: "Partially paid" },
  { key: "paid", label: "Paid" },
  { key: "voided", label: "Voided" },
] as const;

export async function InvoiceListPage({ status, page = 1, clientId }: { status?: string; page?: number; clientId?: string } = {}) {
  const actor = await requirePagePermission(PERMISSIONS.INVOICES_READ);
  const validStatus = TABS.find((t) => t.key === status)?.key;
  const result = await invoiceService.list(actor, { page, pageSize: PAGE_SIZE, status: validStatus, clientId });
  const today = new Date().toISOString().slice(0, 10);
  const href = (changes: { status?: string; page?: number }) => "?" + new URLSearchParams(Object.entries({ status: "status" in changes ? changes.status : validStatus, clientId, page: changes.page ? String(changes.page) : undefined }).filter((e): e is [string, string] => Boolean(e[1])));
  const canCreate = can(actor, PERMISSIONS.INVOICES_CREATE);

  return (
    <section>
      <PageHeader eyebrow="Finance" title="Invoices" description="Draft, issue and track invoices. Balances use posted payment allocations only."
        actions={canCreate ? <Link className="button-primary inline-flex items-center gap-1.5 px-3 py-2 text-sm" href={clientId ? `/finance/invoices/new?clientId=${clientId}` : "/finance/invoices/new"}><Plus className="h-4 w-4" aria-hidden />New invoice</Link> : null} />
      <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Invoice status">
        {TABS.map((tab) => {
          const active = validStatus === tab.key;
          return <FilterChip key={tab.label} href={href({ status: tab.key })} active={active} variant="pill">{tab.label}</FilterChip>;
        })}
        {clientId ? <Link href={href({})} className="ml-auto text-xs text-text-muted hover:text-primary">Filtered to one client ·</Link> : null}
        {clientId ? <Link href={validStatus ? `?status=${validStatus}` : "?"} className="text-xs font-medium text-primary hover:underline">Show all clients</Link> : null}
      </div>
      {can(actor, PERMISSIONS.PAYMENTS_CREATE) ? (
        <details id="record-payment" className="mb-4 rounded-[14px] border border-border bg-surface shadow-[0_1px_2px_rgb(24_35_31/4%)]">
          <summary className="cursor-pointer px-5 py-3.5 text-sm font-semibold text-text-primary">Record a client payment or advance</summary>
          <div className="border-t border-border px-5 py-4"><p className="mb-3 text-xs text-text-muted">To settle a specific invoice, open it and record the payment there; it will be allocated automatically.</p><InvoicePaymentForm /></div>
        </details>
      ) : null}
      {result.items.length === 0 ? (
        <EmptyState icon={<FileText className="h-5 w-5" />} title={validStatus ? "No invoices with this status" : "No invoices yet"} description="Create a draft invoice for a client, then issue it to start tracking receivables."
          action={canCreate ? <Link className="button-primary px-4 py-2 text-sm" href="/finance/invoices/new">Create invoice</Link> : undefined} />
      ) : (
        <TableCard footer={<Pager page={page} pages={Math.ceil(result.total / PAGE_SIZE)} total={result.total} href={(p) => href({ page: p })} />}>
          <table className="data-table nx-record-list">
            <thead><tr><th>Invoice</th><th>Client</th><th>Status</th><th className="text-right">Total</th><th className="text-right">Balance due</th><th>Due date</th></tr></thead>
            <tbody>
              {result.items.map((invoice) => {
                const balanceDue = subtractMinor(invoice.totalMinor, invoice.paidMinor ?? "0");
                const open = !["draft", "voided", "paid"].includes(invoice.status) && BigInt(balanceDue) > BigInt(0);
                const late = open && invoice.dueDate !== null && invoice.dueDate < today;
                return (
                  <tr key={invoice.id}>
                    <td data-label="Invoice"><Link className="nx-link" href={`/finance/invoices/${invoice.id}`}>{invoice.invoiceNumber ?? "Draft"}</Link><p className="max-w-64 truncate text-xs text-text-muted">{invoice.title}</p></td>
                    <td data-label="Client"><span className="font-medium text-text-primary">{invoice.clientName ?? "—"}</span>{invoice.clientCompanyName ? <p className="text-xs text-text-muted">{invoice.clientCompanyName}</p> : null}</td>
                    <td data-label="Status">{late ? <StatusBadge status="overdue" /> : <StatusBadge status={invoice.status} />}</td>
                    <td data-label="Total" className="whitespace-nowrap text-right font-medium tabular-nums">{formatMinor(invoice.totalMinor, invoice.currencyCode)}</td>
                    <td data-label="Balance due" className={cn("whitespace-nowrap text-right tabular-nums", late ? "font-semibold text-danger" : "text-text-secondary")}>{open ? formatMinor(balanceDue, invoice.currencyCode) : "—"}</td>
                    <td data-label="Due date" className={cn("whitespace-nowrap", late ? "text-danger" : "text-text-secondary")}>{formatDate(invoice.dueDate)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableCard>
      )}
      <Panel className="mt-4" title="Need the full picture?" description="Daily cashbook, client balances and department profitability live in Revenue."><Link href="/finance" className="text-sm font-medium text-primary hover:underline">Open Revenue →</Link></Panel>
    </section>
  );
}
