import Link from "next/link";
import { and, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { Search } from "lucide-react";

import { db } from "@/db";
import { clientContacts, clients, deals, leads } from "@/db/schema";
import { getCrmScope, type CrmScope } from "@/features/crm/shared/types";
import { EmptyState, PageHeader, Panel, StatusBadge } from "@/components/nx";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { can } from "@/lib/authorization/policy";
import { requirePageActor } from "@/lib/authorization/server";
import { formatMajor } from "@/lib/format";

export const instant = false;
const LIMIT = 8;

function scopeFor(table: typeof leads | typeof clients | typeof deals, scope: CrmScope) {
  if (scope.kind === "global") return undefined;
  if (scope.kind === "owner") return eq(table.ownerId, scope.userId);
  return scope.departmentIds.length ? inArray(table.departmentId, scope.departmentIds) : sql`false`;
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const actor = await requirePageActor();
  const { q: raw = "" } = await searchParams;
  const q = raw.trim().slice(0, 100);
  const scope = getCrmScope(actor);
  const term = `%${q}%`;
  const [leadRows, clientRows, dealRows, contactRows] = q ? await Promise.all([
    can(actor, PERMISSIONS.CRM_LEADS_READ) ? db.select({ id: leads.id, name: leads.contactName, company: leads.companyName, status: leads.status }).from(leads)
      .where(and(isNull(leads.archivedAt), scopeFor(leads, scope), or(ilike(leads.contactName, term), ilike(leads.companyName, term), ilike(leads.email, term), ilike(leads.phone, term)))).orderBy(desc(leads.createdAt)).limit(LIMIT) : [],
    can(actor, PERMISSIONS.CRM_CLIENTS_READ) ? db.select({ id: clients.id, name: clients.name, company: clients.companyName, phone: clients.phone }).from(clients)
      .where(and(isNull(clients.archivedAt), scopeFor(clients, scope), or(ilike(clients.name, term), ilike(clients.companyName, term), ilike(clients.email, term), ilike(clients.phone, term)))).orderBy(desc(clients.createdAt)).limit(LIMIT) : [],
    can(actor, PERMISSIONS.CRM_DEALS_READ) ? db.select({ id: deals.id, title: deals.title, stage: deals.stage, value: deals.expectedValue, currency: deals.currency }).from(deals)
      .where(and(isNull(deals.archivedAt), scopeFor(deals, scope), ilike(deals.title, term))).orderBy(desc(deals.createdAt)).limit(LIMIT) : [],
    can(actor, PERMISSIONS.CRM_CLIENTS_READ) ? db.select({ id: clientContacts.id, name: clientContacts.name, email: clientContacts.email, clientId: clients.id, client: clients.name }).from(clientContacts).innerJoin(clients, eq(clients.id, clientContacts.clientId))
      .where(and(isNull(clients.archivedAt), scopeFor(clients, scope), or(ilike(clientContacts.name, term), ilike(clientContacts.email, term), ilike(clientContacts.phone, term)))).limit(LIMIT) : [],
  ]) : [[], [], [], []];
  const total = leadRows.length + clientRows.length + dealRows.length + contactRows.length;

  return (
    <section>
      <PageHeader title="Search" description={q ? `${total} result${total === 1 ? "" : "s"} for “${q}”` : "Search leads, clients, contacts and deals."} />
      <form className="mb-6 flex max-w-xl gap-2" role="search">
        <input name="q" defaultValue={q} autoFocus aria-label="Search" placeholder="Name, company, email or phone" className="input mt-0 flex-1" />
        <button className="button-primary px-4 text-sm">Search</button>
      </form>
      {!q ? null : total === 0 ? <EmptyState icon={<Search className="h-5 w-5" />} title="No matches" description="Try a different name, company, email or phone number." /> : (
        <div className="grid gap-4 md:grid-cols-2">
          {leadRows.length ? <Panel title="Leads" bodyClassName="p-2"><ul>{leadRows.map((r) => <li key={r.id}><Link href={`/crm/leads/${r.id}`} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-surface-hover"><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{r.name}</span><span className="block truncate text-xs text-text-muted">{r.company ?? "—"}</span></span><StatusBadge status={r.status} /></Link></li>)}</ul></Panel> : null}
          {clientRows.length ? <Panel title="Clients" bodyClassName="p-2"><ul>{clientRows.map((r) => <li key={r.id}><Link href={`/crm/clients/${r.id}`} className="block rounded-lg px-3 py-2 hover:bg-surface-hover"><span className="block truncate text-sm font-medium">{r.name}</span><span className="block truncate text-xs text-text-muted">{[r.company, r.phone].filter(Boolean).join(" · ") || "—"}</span></Link></li>)}</ul></Panel> : null}
          {dealRows.length ? <Panel title="Deals" bodyClassName="p-2"><ul>{dealRows.map((r) => <li key={r.id}><Link href={`/crm/deals/${r.id}`} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-surface-hover"><span className="min-w-0 flex-1 truncate text-sm font-medium">{r.title}</span><StatusBadge status={r.stage} /><span className="text-sm tabular-nums">{formatMajor(r.value, r.currency)}</span></Link></li>)}</ul></Panel> : null}
          {contactRows.length ? <Panel title="Contacts" bodyClassName="p-2"><ul>{contactRows.map((r) => <li key={r.id}><Link href={`/crm/clients/${r.clientId}`} className="block rounded-lg px-3 py-2 hover:bg-surface-hover"><span className="block truncate text-sm font-medium">{r.name}</span><span className="block truncate text-xs text-text-muted">{[r.client, r.email].filter(Boolean).join(" · ")}</span></Link></li>)}</ul></Panel> : null}
        </div>
      )}
    </section>
  );
}
