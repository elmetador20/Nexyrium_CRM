import Link from "next/link";
import { notFound } from "next/navigation";

import { LeadForm } from "@/features/crm/leads/components/LeadForm";
import { leadRepository } from "@/features/crm/leads/queries";
import { createLeadService } from "@/features/crm/leads/services";
import { CrmError } from "@/features/crm/shared/errors";
import { recordAuditEvent } from "@/lib/audit/service";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { requirePagePermission } from "@/lib/authorization/server";

export const instant = false;
const service = createLeadService({ repository: leadRepository, audit: recordAuditEvent });

export default async function EditLeadPage({ params }: { params: Promise<{ leadId: string }> }) {
  const actor = await requirePagePermission(PERMISSIONS.CRM_LEADS_UPDATE);
  const { leadId } = await params;
  let detail;
  try { detail = await service.get(actor, leadId); } catch (error) { if (error instanceof CrmError && error.code === "NOT_FOUND") notFound(); throw error; }
  const { lead } = detail;
  return <section className="mx-auto max-w-3xl"><Link href={`/crm/leads/${lead.id}`} className="text-sm text-text-muted hover:underline">← Back to lead</Link><div className="mt-5 rounded-2xl border border-border bg-surface p-6 shadow-sm"><h2 className="text-2xl font-semibold">Edit lead</h2><div className="mt-8"><LeadForm endpoint={`/api/v1/leads/${lead.id}`} method="PATCH" initial={{ ...lead, nextActionAt: lead.nextActionAt ? new Date(lead.nextActionAt).toISOString().slice(0, 16) : null }} /></div></div></section>;
}
