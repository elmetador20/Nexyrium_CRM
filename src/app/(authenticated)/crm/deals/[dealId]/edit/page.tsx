import Link from "next/link";
import { notFound } from "next/navigation";

import { DealForm } from "@/features/crm/deals/components/DealForm";
import { dealRepository } from "@/features/crm/deals/queries";
import { createDealService } from "@/features/crm/deals/services";
import { CrmError } from "@/features/crm/shared/errors";
import { recordAuditEvent } from "@/lib/audit/service";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { requirePagePermission } from "@/lib/authorization/server";

export const instant = false;
const service = createDealService({ repository: dealRepository, audit: recordAuditEvent });

export default async function EditDealPage({ params }: { params: Promise<{ dealId: string }> }) {
  const actor = await requirePagePermission(PERMISSIONS.CRM_DEALS_UPDATE);
  const { dealId } = await params;
  let deal;
  try { deal = await service.get(actor, dealId); } catch (error) { if (error instanceof CrmError && error.code === "NOT_FOUND") notFound(); throw error; }
  return <section className="mx-auto max-w-3xl"><Link href={`/crm/deals/${deal.id}`} className="text-sm text-text-muted hover:underline">← Back to deal</Link><div className="mt-5 rounded-2xl border border-border bg-surface p-6 shadow-sm"><h2 className="text-2xl font-semibold">Edit deal</h2><div className="mt-8"><DealForm endpoint={`/api/v1/deals/${deal.id}`} method="PATCH" initial={{ ...deal, expectedCloseDate: deal.expectedCloseDate ?? "" }} /></div></div></section>;
}
