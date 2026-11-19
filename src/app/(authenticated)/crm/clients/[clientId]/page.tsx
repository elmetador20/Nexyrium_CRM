import Link from "next/link";
import { notFound } from "next/navigation";
import { FilePlus2, Globe, Mail, Pencil, Phone } from "lucide-react";

import { ClientFinancials } from "@/features/crm/clients/components/ClientFinancials";
import { clientRepository } from "@/features/crm/clients/queries";
import { createClientService } from "@/features/crm/clients/services";
import { CrmError } from "@/features/crm/shared/errors";
import { DepartmentChip, KeyValue, PageHeader, Panel, StatusBadge } from "@/components/nx";
import { recordAuditEvent } from "@/lib/audit/service";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { can } from "@/lib/authorization/policy";
import { requirePagePermission } from "@/lib/authorization/server";
import { formatDate, formatMajor } from "@/lib/format";
import { label, resolveLabels } from "@/lib/labels";

export const instant = false;
const service = createClientService({ repository: clientRepository, audit: recordAuditEvent });

export default async function ClientDetailPage({ params }: { params: Promise<{ clientId: string }> }) {
  const actor = await requirePagePermission(PERMISSIONS.CRM_CLIENTS_READ);
  const { clientId } = await params;
  let detail;
  try { detail = await service.get(actor, clientId); } catch (error) { if (error instanceof CrmError && error.code === "NOT_FOUND") notFound(); throw error; }
  const { client, contacts, leadLinks, deals } = detail;
  const labels = await resolveLabels({ users: [client.ownerId], departments: [client.departmentId], leads: leadLinks.map((l) => l.leadId) });

  return (
    <section>
      <PageHeader
        back={{ href: "/crm/clients", label: "Clients" }}
        eyebrow="Client"
        title={<span className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-light text-sm font-semibold text-primary" aria-hidden>{client.name.slice(0, 2).toUpperCase()}</span>{client.name}</span>}
        description={client.companyName ?? "No company"}
        actions={<>
          {can(actor, PERMISSIONS.INVOICES_CREATE) ? <Link href={`/finance/invoices/new?clientId=${client.id}`} className="button-secondary inline-flex items-center gap-1.5 px-3 py-2 text-sm"><FilePlus2 className="h-4 w-4" aria-hidden />New invoice</Link> : null}
          {can(actor, PERMISSIONS.CRM_CLIENTS_UPDATE) ? <Link href={`/crm/clients/${client.id}/edit`} className="button-secondary inline-flex items-center gap-1.5 px-3 py-2 text-sm"><Pencil className="h-4 w-4" aria-hidden />Edit</Link> : null}
        </>}
      />
      <div className="space-y-4">
        <ClientFinancials id={client.id} actor={actor} />
        <div className="grid gap-4 lg:grid-cols-3">
          <Panel title="Company">
            <dl className="grid gap-4">
              <KeyValue label="Phone" value={client.phone ? <a className="inline-flex items-center gap-1.5 hover:text-primary" href={`tel:${client.phone}`}><Phone className="h-3.5 w-3.5" aria-hidden />{client.phone}</a> : null} />
              <KeyValue label="Email" value={client.email ? <a className="inline-flex items-center gap-1.5 hover:text-primary" href={`mailto:${client.email}`}><Mail className="h-3.5 w-3.5" aria-hidden />{client.email}</a> : null} />
              <KeyValue label="Website" value={client.website ? <a className="inline-flex items-center gap-1.5 hover:text-primary" href={client.website} target="_blank" rel="noreferrer"><Globe className="h-3.5 w-3.5" aria-hidden />{client.website.replace(/^https?:\/\//, "")}</a> : null} />
              <KeyValue label="Owner" value={label(labels.users, client.ownerId)} />
              <KeyValue label="Department" value={<DepartmentChip name={client.departmentId ? labels.departments.get(client.departmentId) : null} />} />
              <KeyValue label="Client since" value={formatDate(client.createdAt)} />
            </dl>
          </Panel>
          <Panel title="Contacts" description={`${contacts.length} contact${contacts.length === 1 ? "" : "s"}`} bodyClassName="p-2">
            {contacts.length ? (
              <ul>
                {contacts.map((contact) => (
                  <li key={contact.id} className="rounded-lg px-3 py-2.5 hover:bg-surface-hover">
                    <p className="flex items-center gap-2 text-sm font-medium text-text-primary">{contact.name}{contact.isPrimary ? <StatusBadge tone="primary">Primary</StatusBadge> : null}</p>
                    <p className="text-xs text-text-muted">{[contact.jobTitle, contact.email, contact.phone].filter(Boolean).join(" · ") || "No details"}</p>
                  </li>
                ))}
              </ul>
            ) : <p className="px-3 py-6 text-center text-sm text-text-muted">No contacts yet. Add one from Edit.</p>}
          </Panel>
          <Panel title="Deals" description={`${deals.length} linked`} bodyClassName="p-2">
            {deals.length ? (
              <ul>
                {deals.map((deal) => (
                  <li key={deal.id}>
                    <Link href={`/crm/deals/${deal.id}`} className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-hover">
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-text-primary">{deal.title}</span></span>
                      <StatusBadge status={deal.stage} />
                      <span className="text-sm font-medium tabular-nums">{formatMajor(deal.expectedValue, deal.currency)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="px-3 py-6 text-center text-sm text-text-muted">No linked deals.</p>}
            {leadLinks.length ? (
              <div className="mt-2 border-t border-border px-3 pt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-text-muted">Source leads</p>
                <ul className="mt-1.5 space-y-1">{leadLinks.map((link) => <li key={link.leadId}><Link href={`/crm/leads/${link.leadId}`} className="nx-link text-sm">{label(labels.leads, link.leadId)}</Link></li>)}</ul>
              </div>
            ) : null}
          </Panel>
        </div>
        <Panel title="Notes"><p className="whitespace-pre-wrap text-sm text-text-secondary">{client.notes || "No notes yet."}</p></Panel>
      </div>
    </section>
  );
}
