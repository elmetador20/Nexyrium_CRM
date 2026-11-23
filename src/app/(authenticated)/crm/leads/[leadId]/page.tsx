import {ContactActions,FollowUpOutcome} from "@/features/integrations/whatsapp/ContactActions";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, Mail, Pencil } from "lucide-react";

import { getAcquisitionSource, ACQUISITION_LABELS } from "@/features/crm/leads/acquisition-source";
import { ConvertLeadForm } from "@/features/crm/leads/components/ConvertLeadForm";
import { leadRepository } from "@/features/crm/leads/queries";
import { createLeadService } from "@/features/crm/leads/services";
import { CrmError } from "@/features/crm/shared/errors";
import { DepartmentChip, KeyValue, PageHeader, Panel, StatusBadge } from "@/components/nx";
import { recordAuditEvent } from "@/lib/audit/service";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { can } from "@/lib/authorization/policy";
import { requirePagePermission } from "@/lib/authorization/server";
import { formatDate, humanize } from "@/lib/format";
import { label, resolveLabels } from "@/lib/labels";

export const instant = false;
const service = createLeadService({ repository: leadRepository, audit: recordAuditEvent });

export default async function LeadDetailPage({ params }: { params: Promise<{ leadId: string }> }) {
  const actor = await requirePagePermission(PERMISSIONS.CRM_LEADS_READ);
  const { leadId } = await params;
  let detail;
  try { detail = await service.get(actor, leadId); } catch (error) { if (error instanceof CrmError && error.code === "NOT_FOUND") notFound(); throw error; }
  const { lead, activities, sourceHistory } = detail;
  const labels = await resolveLabels({ users: [lead.ownerId], departments: [lead.departmentId] });
  const acquisition = getAcquisitionSource(lead.source, lead.sourceDetails);
  const canConvert = can(actor, PERMISSIONS.CRM_LEADS_CONVERT) && !lead.convertedAt;

  return (
    <section>
      <PageHeader
        back={{ href: "/crm/leads", label: "Leads" }}
        eyebrow="Lead"
        title={<span className="flex flex-wrap items-center gap-3">{lead.contactName}<StatusBadge status={lead.status} />{lead.convertedAt ? <StatusBadge tone="success">Converted</StatusBadge> : null}</span>}
        description={[lead.companyName ?? "No company", acquisition ? ACQUISITION_LABELS[acquisition] : "Unclassified"].join(" · ")}
        actions={<>
          {can(actor, PERMISSIONS.CRM_LEADS_UPDATE) ? <Link href={`/crm/leads/${lead.id}/edit`} className="button-secondary inline-flex items-center gap-1.5 px-3 py-2 text-sm"><Pencil className="h-4 w-4" aria-hidden />Edit</Link> : null}
          {canConvert ? <ConvertLeadForm lead={{ id: lead.id, contactName: lead.contactName, companyName: lead.companyName, email: lead.email, phone: lead.phone }} /> : null}
        </>}
      />
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          <Panel title="Contact">
            <dl className="grid gap-4 sm:grid-cols-2">
              <KeyValue label="Phone" value={lead.phone} />
              <ContactActions phone={lead.normalizedPhone ?? lead.phone} />
              <KeyValue label="Email" value={lead.email ? <a className="inline-flex items-center gap-1.5 hover:text-primary" href={`mailto:${lead.email}`}><Mail className="h-3.5 w-3.5" aria-hidden />{lead.email}</a> : null} />
              <KeyValue label="Company" value={lead.companyName} />
              <KeyValue label="Created" value={formatDate(lead.createdAt, true)} />
            </dl>
          </Panel>
          <Panel title="Notes"><p className="whitespace-pre-wrap text-sm text-text-secondary">{lead.notes || "No notes yet."}</p></Panel>
          {can(actor, PERMISSIONS.CRM_LEADS_UPDATE) && <FollowUpOutcome id={lead.id}/>}
          <Panel title="Activity timeline" description={`${activities.length} entr${activities.length === 1 ? "y" : "ies"}`}>
            {activities.length ? (
              <ol className="relative space-y-5 border-l border-border pl-5">
                {activities.map((activity) => (
                  <li key={activity.id} className="relative">
                    <span className="absolute -left-[1.6rem] top-1 h-2.5 w-2.5 rounded-full border-2 border-surface bg-secondary" aria-hidden />
                    <p className="text-sm font-medium capitalize text-text-primary">{humanize(activity.type)}</p>
                    <p className="mt-0.5 whitespace-pre-wrap text-sm text-text-secondary">{activity.content}</p>
                    <p className="mt-1 text-xs text-text-muted">{formatDate(activity.occurredAt, true)}</p>
                  </li>
                ))}
              </ol>
            ) : <p className="text-sm text-text-muted">No activity recorded.</p>}
          </Panel>
        </div>
        <div className="space-y-4">
          <Panel title="Ownership">
            <dl className="grid gap-4">
              <KeyValue label="Owner" value={label(labels.users, lead.ownerId)} />
              <KeyValue label="Department" value={<DepartmentChip name={lead.departmentId ? labels.departments.get(lead.departmentId) : null} />} />
            </dl>
          </Panel>
          <Panel title={<span className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-accent" aria-hidden />Next action</span>}>
            <dl className="grid gap-4">
              <KeyValue label="Action" value={lead.nextAction} />
              <KeyValue label="Follow-up" value={lead.nextActionAt ? formatDate(lead.nextActionAt, true) : null} />
            </dl>
          </Panel>
          <Panel title="Source history">
            {sourceHistory.length ? (
              <ul className="space-y-3">
                {sourceHistory.map((history) => (
                  <li key={history.id}>
                    <p className="text-sm font-medium capitalize text-text-primary">{humanize(history.source)}</p>
                    <p className="text-xs text-text-muted">{formatDate(history.recordedAt, true)}</p>
                    {history.details ? <p className="mt-1 text-sm text-text-secondary">{history.details}</p> : null}
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-text-muted">No source history.</p>}
          </Panel>
        </div>
      </div>
    </section>
  );
}
