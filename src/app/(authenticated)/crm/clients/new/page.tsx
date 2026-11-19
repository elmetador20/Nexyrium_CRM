import Link from "next/link";

import { ClientForm } from "@/features/crm/clients/components/ClientForm";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { requirePagePermission } from "@/lib/authorization/server";

export const instant = false;

export default async function NewClientPage() {
  await requirePagePermission(PERMISSIONS.CRM_CLIENTS_CREATE);
  return <section className="mx-auto max-w-3xl"><Link href="/crm/clients" className="text-sm text-text-muted hover:underline">← Back to clients</Link><div className="mt-5 rounded-2xl border border-border bg-surface p-6 shadow-sm"><h2 className="text-2xl font-semibold">Create client</h2><p className="mt-2 text-sm text-text-muted">Enter the client name, company and phone. You can add a contact and department now or later.</p><div className="mt-8"><ClientForm endpoint="/api/v1/clients" method="POST" /></div></div></section>;
}
