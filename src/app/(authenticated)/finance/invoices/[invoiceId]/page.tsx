import Link from "next/link";
import { notFound } from "next/navigation";

import { FinancialDetailActions } from "@/features/finance/components/FinancialDetailActions";
import { InvoicePaymentForm } from "@/features/finance/components/InvoicePaymentForm";
import { invoiceService } from "@/features/finance/server";
import { formatMoney, subtractMinor } from "@/features/finance/shared/money";
import { can } from "@/lib/authorization/policy";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { requirePagePermission } from "@/lib/authorization/server";

export const instant = false;

export default async function InvoiceDetailPage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const actor = await requirePagePermission(PERMISSIONS.INVOICES_READ);
  const { invoiceId } = await params;
  const result = await invoiceService.get(actor, invoiceId).catch(() => null);
  if (!result) notFound();

  const allocated = result.allocations.reduce((sum, allocation) => sum + BigInt(allocation.allocatedAmountMinor), BigInt(0)).toString();
  const outstanding = subtractMinor(result.invoice.totalMinor, allocated);
  const canRecordPayment = can(actor, PERMISSIONS.PAYMENTS_CREATE)
    && can(actor, PERMISSIONS.PAYMENTS_ALLOCATE)
    && ["issued", "partially_paid", "overdue"].includes(result.invoice.status)
    && outstanding !== "0";

  return (
    <section>
      <Link href="/finance/invoices" className="text-sm text-text-muted hover:text-primary hover:underline">← Back to invoices</Link>
      <div className="card mt-5 p-6">
        <div className="flex flex-wrap justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-text-muted">{result.invoice.invoiceNumber ?? "Draft invoice"}</p>
            <h1 className="mt-1 text-2xl font-semibold text-text-primary">{result.invoice.title}</h1>
            <p className="mt-2 text-sm text-text-secondary">Client: {result.client?.name ?? "—"}{result.client?.companyName ? ` · ${result.client.companyName}` : ""}</p>
            <p className="mt-1 text-sm text-text-secondary">Status: <span className="font-medium capitalize">{result.invoice.status.replaceAll("_", " ")}</span></p>
          </div>
          <FinancialDetailActions canSave={can(actor, PERMISSIONS.INVOICES_UPDATE) && can(actor, PERMISSIONS.FINANCIAL_DOCUMENTS_DOWNLOAD)} kind="invoice" id={invoiceId} status={result.invoice.status} />
        </div>

        <div className="mt-8 overflow-x-auto">
          <table className="table">
            <thead><tr><th>Description</th><th>Quantity</th><th>Unit price</th><th>Discount</th><th>Tax</th><th>Total</th></tr></thead>
            <tbody>{result.lines.map((line) => <tr key={line.id}><td>{line.description}</td><td>{line.quantity}</td><td>{formatMoney(line.unitPriceMinor, result.invoice.currencyCode)}</td><td>{line.discountBps / 100}%</td><td>{line.taxBps / 100}%</td><td className="font-medium">{formatMoney(line.lineTotalMinor, result.invoice.currencyCode)}</td></tr>)}</tbody>
          </table>
        </div>

        <dl className="mt-6 ml-auto max-w-xs space-y-2 text-sm">
          <SummaryRow label="Subtotal" value={formatMoney(result.invoice.subtotalMinor, result.invoice.currencyCode)} />
          <SummaryRow label="Discount" value={formatMoney(result.invoice.discountMinor, result.invoice.currencyCode)} />
          <SummaryRow label="Tax" value={formatMoney(result.invoice.taxMinor, result.invoice.currencyCode)} />
          <SummaryRow label="Total" value={formatMoney(result.invoice.totalMinor, result.invoice.currencyCode)} strong />
          <SummaryRow label="Allocated" value={formatMoney(allocated, result.invoice.currencyCode)} />
          <SummaryRow label="Balance due" value={formatMoney(outstanding, result.invoice.currencyCode)} strong />
        </dl>

        {canRecordPayment ? <InvoicePaymentForm invoiceId={invoiceId} clientId={result.invoice.clientId} currencyCode={result.invoice.currencyCode} outstandingMinor={outstanding} /> : null}
      </div>
    </section>
  );
}

function SummaryRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className={`flex justify-between gap-6 ${strong ? "border-t border-border pt-3 text-base font-semibold text-text-primary" : "text-text-secondary"}`}><dt>{label}</dt><dd className={strong ? "text-text-primary" : "font-medium text-text-primary"}>{value}</dd></div>;
}
