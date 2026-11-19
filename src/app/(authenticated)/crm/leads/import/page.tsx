import Link from "next/link";

import { LeadImportForm } from "@/features/lead-intake/components/LeadImportForm";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { requirePagePermission } from "@/lib/authorization/server";

export const instant = false;

export default async function LeadImportPage() {
  await requirePagePermission(PERMISSIONS.CRM_LEADS_CREATE);
  return <section className="mx-auto max-w-5xl"><Link href="/crm/leads" className="text-sm text-text-muted hover:text-primary hover:underline">← Back to leads</Link><div className="mt-5"><h1 className="text-2xl font-semibold text-text-primary">Import leads</h1><p className="mt-2 text-sm text-text-secondary">Preview, validate, and route every accepted row through the unified lead-intake service.</p></div><div className="mt-8"><LeadImportForm /></div></section>;
}
