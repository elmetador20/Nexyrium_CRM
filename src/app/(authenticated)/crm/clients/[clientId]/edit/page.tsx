import Link from "next/link";
import { notFound } from "next/navigation";

import { ClientForm } from "@/features/crm/clients/components/ClientForm";
import { clientRepository } from "@/features/crm/clients/queries";
import { createClientService } from "@/features/crm/clients/services";
import { CrmError } from "@/features/crm/shared/errors";
import { recordAuditEvent } from "@/lib/audit/service";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { requirePagePermission } from "@/lib/authorization/server";

export const instant = false;
const service = createClientService({ repository: clientRepository, audit: recordAuditEvent });

export default async function EditClientPage({ params }: { params: Promise<{ clientId: string }> }) {
  const actor = await requirePagePermission(PERMISSIONS.CRM_CLIENTS_UPDATE);
  const { clientId } = await params;
  let detail;
  try { detail = await service.get(actor, clientId); } catch (error) { if (error instanceof CrmError && error.code === "NOT_FOUND") notFound(); throw error; }
  const { client, contacts } = detail;
  return <section className="mx-auto max-w-3xl"><Link href={`/crm/clients/${client.id}`} className="text-sm text-text-muted hover:underline">← Back to client</Link><div className="mt-5 rounded-2xl border border-border bg-surface p-6 shadow-sm"><h2 className="text-2xl font-semibold">Edit client</h2><div className="mt-8"><ClientForm endpoint={`/api/v1/clients/${client.id}`} method="PATCH" initial={{ ...client, contacts }} /></div></div></section>;
}
