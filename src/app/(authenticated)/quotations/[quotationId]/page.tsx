import { can } from "@/lib/authorization/policy";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FinancialDetailActions } from "@/features/finance/components/FinancialDetailActions";
import { quotationService } from "@/features/finance/server";
import { formatMoney } from "@/features/finance/shared/money";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { requirePagePermission } from "@/lib/authorization/server";

export const instant = false;

export default async function QuotationDetailPage({ params }: { params: Promise<{ quotationId: string }> }) {
  const actor = await requirePagePermission(PERMISSIONS.QUOTATIONS_READ);
  const { quotationId } = await params;
  const result = await quotationService.get(actor, quotationId).catch(() => null);
  if (!result) notFound();

  return (
    <section>
      <Link href="/quotations" className="text-sm text-text-muted hover:text-primary hover:underline">← Back to quotations</Link>
      <div className="card mt-5 p-6">
        <div className="flex flex-wrap justify-between gap-4">
          <div><p className="text-sm font-medium text-text-muted">{result.quotation.quotationNumber ?? "Draft quotation"}</p><h1 className="mt-1 text-2xl font-semibold text-text-primary">{result.quotation.title}</h1><p className="mt-2 text-sm text-text-secondary">Status: <span className="capitalize">{result.quotation.status}</span></p></div>
          <FinancialDetailActions canSave={can(actor, PERMISSIONS.QUOTATIONS_UPDATE) && can(actor, PERMISSIONS.FINANCIAL_DOCUMENTS_DOWNLOAD)} kind="quotation" id={quotationId} status={result.quotation.status} />
        </div>
        <div className="mt-8 overflow-x-auto"><table className="table"><thead><tr><th>Description</th><th>Quantity</th><th>Unit price</th><th>Total</th></tr></thead><tbody>{result.lines.map((line) => <tr key={line.id}><td>{line.description}</td><td>{line.quantity}</td><td>{formatMoney(line.unitPriceMinor, result.quotation.currencyCode)}</td><td className="font-medium">{formatMoney(line.lineTotalMinor, result.quotation.currencyCode)}</td></tr>)}</tbody></table></div>
        <p className="mt-6 text-right text-lg font-semibold text-text-primary">Total: {formatMoney(result.quotation.totalMinor, result.quotation.currencyCode)}</p>
      </div>
    </section>
  );
}
