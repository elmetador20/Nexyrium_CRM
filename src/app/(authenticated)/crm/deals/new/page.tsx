import Link from "next/link";

import { DealForm } from "@/features/crm/deals/components/DealForm";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { requirePagePermission } from "@/lib/authorization/server";

export const instant = false;

export default async function NewDealPage() {
  await requirePagePermission(PERMISSIONS.CRM_DEALS_CREATE);
  return <section className="mx-auto max-w-3xl"><Link href="/crm/deals" className="text-sm text-text-muted hover:underline">← Back to deals</Link><div className="mt-5 rounded-2xl border border-border bg-surface p-6 shadow-sm"><h2 className="text-2xl font-semibold">Create deal</h2><p className="mt-2 text-sm text-text-muted">Add a pipeline opportunity with value and expected close date.</p><div className="mt-8"><DealForm endpoint="/api/v1/deals" method="POST" /></div></div></section>;
}
