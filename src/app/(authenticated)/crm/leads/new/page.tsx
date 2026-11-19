import Link from "next/link";

import { LeadForm } from "@/features/crm/leads/components/LeadForm";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { requirePagePermission } from "@/lib/authorization/server";

export const instant = false;

export default async function NewLeadPage() {
  await requirePagePermission(PERMISSIONS.CRM_LEADS_CREATE);
  return <section className="mx-auto max-w-3xl"><Link href="/crm/leads" className="text-sm text-text-muted hover:underline">← Back to leads</Link><div className="mt-5 rounded-2xl border border-border bg-surface p-6 shadow-sm"><h2 className="text-2xl font-semibold">Create lead</h2><p className="mt-2 text-sm text-text-muted">Capture a prospect and define the next action.</p><div className="mt-8"><LeadForm endpoint="/api/v1/lead-intake" method="POST" /></div></div></section>;
}
