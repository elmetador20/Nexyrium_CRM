import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";

import { dealRepository } from "@/features/crm/deals/queries";
import { createDealService } from "@/features/crm/deals/services";
import { StageSelect } from "@/features/crm/deals/components/StageSelect";
import { CrmError } from "@/features/crm/shared/errors";
import { DepartmentChip, KeyValue, PageHeader, Panel, StatusBadge } from "@/components/nx";
import { recordAuditEvent } from "@/lib/audit/service";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { can } from "@/lib/authorization/policy";
import { requirePagePermission } from "@/lib/authorization/server";
import { formatDate, formatMajor } from "@/lib/format";
import { label, resolveLabels } from "@/lib/labels";

export const instant = false;
const service = createDealService({ repository: dealRepository, audit: recordAuditEvent });

export default async function DealDetailPage({ params }: { params: Promise<{ dealId: string }> }) {
  const actor = await requirePagePermission(PERMISSIONS.CRM_DEALS_READ);
  const { dealId } = await params;
  let deal;
  try { deal = await service.get(actor, dealId); } catch (error) { if (error instanceof CrmError && error.code === "NOT_FOUND") notFound(); throw error; }
  const labels = await resolveLabels({ users: [deal.ownerId], departments: [deal.departmentId], clients: [deal.clientId], leads: [deal.leadId] });
  const canEdit = can(actor, PERMISSIONS.CRM_DEALS_UPDATE);

  return (
    <section>
      <PageHeader
        back={{ href: "/crm/deals", label: "Deals" }}
        eyebrow="Deal"
        title={<span className="flex flex-wrap items-center gap-3">{deal.title}<StatusBadge status={deal.stage} /></span>}
        description={deal.clientId ? label(labels.clients, deal.clientId) : "No client linked"}
        actions={canEdit ? <Link href={`/crm/deals/${deal.id}/edit`} className="button-secondary inline-flex items-center gap-1.5 px-3 py-2 text-sm"><Pencil className="h-4 w-4" aria-hidden />Edit</Link> : null}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Value" className="lg:col-span-1">
          <p className="text-3xl font-semibold tabular-nums tracking-tight text-text-primary">{formatMajor(deal.expectedValue, deal.currency)}</p>
          <p className="mt-1 text-xs text-text-muted">{deal.stage === "won" ? "Contracted value. Collected revenue is tracked in Payments." : deal.stage === "lost" ? "Lost — excluded from pipeline." : "Expected value · counts toward open pipeline"}</p>
          {canEdit ? <div className="mt-4 max-w-48"><p className="mb-1 text-xs font-medium text-text-muted">Move to stage</p><StageSelect dealId={deal.id} stage={deal.stage} /></div> : null}
        </Panel>
        <Panel title="Details" className="lg:col-span-2">
          <dl className="grid gap-4 sm:grid-cols-2">
            <KeyValue label="Expected close" value={formatDate(deal.expectedCloseDate)} />
            <KeyValue label="Owner" value={label(labels.users, deal.ownerId)} />
            <KeyValue label="Department" value={<DepartmentChip name={deal.departmentId ? labels.departments.get(deal.departmentId) : null} />} />
            <KeyValue label="Client" value={deal.clientId ? <Link className="nx-link" href={`/crm/clients/${deal.clientId}`}>{label(labels.clients, deal.clientId)}</Link> : null} />
            <KeyValue label="Source lead" value={deal.leadId ? <Link className="nx-link" href={`/crm/leads/${deal.leadId}`}>{label(labels.leads, deal.leadId)}</Link> : null} />
            <KeyValue label="Created" value={formatDate(deal.createdAt, true)} />
          </dl>
        </Panel>
        <Panel title="Notes" className="lg:col-span-3"><p className="whitespace-pre-wrap text-sm text-text-secondary">{deal.notes || "No notes yet."}</p></Panel>
      </div>
    </section>
  );
}
