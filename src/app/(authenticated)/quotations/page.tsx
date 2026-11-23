import Link from "next/link";

import { quotationService } from "@/features/finance/server";
import { formatMoney } from "@/features/finance/shared/money";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { requirePagePermission } from "@/lib/authorization/server";

export const instant = false;

export default async function QuotationsPage() {
  const actor = await requirePagePermission(PERMISSIONS.QUOTATIONS_READ);
  const result = await quotationService.list(actor, { page: 1, pageSize: 50 });

  return <section><div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-medium text-text-muted">Commercial documents</p><h1 className="mt-1 text-2xl font-semibold text-text-primary">Quotations</h1><p className="mt-1 text-sm text-text-secondary">Prepare, submit, and approve client quotations.</p></div><Link className="button-primary" href="/quotations/new">New quotation</Link></div>{result.items.length === 0 ? <div className="card border-dashed p-10 text-center"><h2 className="font-semibold text-text-primary">No quotations yet</h2><p className="mt-2 text-sm text-text-secondary">Create a quotation to begin a client proposal.</p><Link className="button-primary mt-5" href="/quotations/new">Create quotation</Link></div> : <div className="table-container bg-surface"><table className="nx-record-list table"><thead><tr><th>Number</th><th>Title</th><th>Status</th><th>Total</th></tr></thead><tbody>{result.items.map((quote) => <tr key={quote.id}><td data-label="Number"><Link className="font-medium text-primary hover:underline" href={`/quotations/${quote.id}`}>{quote.quotationNumber ?? "Draft"}</Link></td><td data-label="Title">{quote.title}</td><td data-label="Status" className="capitalize">{quote.status}</td><td data-label="Total" className="whitespace-nowrap font-medium">{formatMoney(quote.totalMinor, quote.currencyCode)}</td></tr>)}</tbody></table></div>}</section>;
}
