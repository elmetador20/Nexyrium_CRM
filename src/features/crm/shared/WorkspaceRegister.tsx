import Link from "next/link";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { Banknote, Contact } from "lucide-react";
import { db } from "@/db";
import { clientContacts, clients, payments } from "@/db/schema";
import { requirePagePermission } from "@/lib/authorization/server";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { getCrmScope } from "./types";
import { workspaceDepartments } from "./departments";
import { financeScope } from "@/features/finance/shared/scope";
import { scopeCondition } from "@/features/finance/shared/repository";
import { DepartmentChip, EmptyState, FilterBar, PageHeader, StatCard, StatusBadge, TableCard } from "@/components/nx";
import { formatCurrencies, formatDate, formatMinor, humanize } from "@/lib/format";
import { resolveLabels } from "@/lib/labels";

export type RegisterParams = Promise<Record<string, string | string[] | undefined>>;

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const PAYMENT_STATUSES = ["posted", "reversed", "refunded"] as const;
const PAGE_SIZE = 50;

/** Contacts and Payments registers: scoped, searchable, paginated lists. */
export async function WorkspaceRegister({ mode, searchParams }: { mode: "contacts" | "payments"; searchParams: RegisterParams }) {
  const contacts = mode === "contacts";
  const actor = await requirePagePermission(contacts ? PERMISSIONS.CRM_CLIENTS_READ : PERMISSIONS.PAYMENTS_READ);
  const params = await searchParams;
  const str = (key: string) => (typeof params[key] === "string" ? (params[key] as string).trim() : "");
  const q = str("q").slice(0, 100);
  const page = Math.min(100000, Math.max(1, Math.floor(Number(params.page)) || 1));
  const offset = (page - 1) * PAGE_SIZE;
  const search = q ? "%" + q + "%" : undefined;
  const scope = getCrmScope(actor);
  const clientScope = scope.kind === "global" ? undefined : scope.kind === "owner" ? eq(clients.ownerId, actor.userId) : scope.departmentIds.length ? inArray(clients.departmentId, scope.departmentIds) : sql`false`;
  const date = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) ? new Date(v + "T00:00:00Z") : undefined);
  const from = date(str("from")), to = date(str("to"));
  if (to) to.setUTCDate(to.getUTCDate() + 1);
  const departmentId = UUID.test(str("departmentId")) ? str("departmentId") : undefined;
  const clientId = UUID.test(str("clientId")) ? str("clientId") : undefined;
  const status = PAYMENT_STATUSES.find((s) => s === str("status"));
  const currency = /^[A-Za-z]{3}$/.test(str("currency")) ? str("currency").toUpperCase() : undefined;
  const departments = await workspaceDepartments(actor);
  const keep = { q: q || undefined, status, currency, departmentId, clientId, from: str("from") || undefined, to: str("to") || undefined };
  const link = (changes: Record<string, string | undefined>) => "?" + new URLSearchParams(Object.entries({ ...keep, ...changes }).filter((e): e is [string, string] => Boolean(e[1])));

  if (contacts) {
    const rows = await db.select({ id: clientContacts.id, client: clients.name, clientId: clients.id, departmentId: clients.departmentId, name: clientContacts.name, title: clientContacts.jobTitle, email: clientContacts.email, phone: clientContacts.phone, primary: clientContacts.isPrimary })
      .from(clientContacts).innerJoin(clients, eq(clients.id, clientContacts.clientId))
      .where(and(clientScope, isNull(clients.archivedAt), departmentId ? eq(clients.departmentId, departmentId) : undefined, search ? or(ilike(clients.name, search), ilike(clientContacts.name, search), ilike(clientContacts.email, search), ilike(clientContacts.phone, search)) : undefined))
      .orderBy(asc(clientContacts.name), asc(clientContacts.id)).limit(PAGE_SIZE + 1).offset(offset);
    const labels = await resolveLabels({ departments: rows.map((r) => r.departmentId) });
    return (
      <section>
        <PageHeader eyebrow="CRM" title="Contacts" description="People at your client companies. Add contacts from a client's Edit page." />
        <FilterBar>
          <input aria-label="Search contacts" className="input min-w-0 flex-1 basis-56" name="q" defaultValue={q} placeholder="Search contact, client, email or phone" />
          <select aria-label="Department" name="departmentId" defaultValue={departmentId ?? ""} className="input w-auto"><option value="">All departments</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          <button className="button-secondary px-4 py-2 text-sm">Apply</button>
        </FilterBar>
        {rows.length ? (
          <TableCard footer={<Nav page={page} more={rows.length > PAGE_SIZE} link={link} />}>
            <table className="data-table nx-record-list">
              <thead><tr><th>Contact</th><th>Client</th><th>Email</th><th>Phone</th><th>Department</th></tr></thead>
              <tbody>{rows.slice(0, PAGE_SIZE).map((r) => (
                <tr key={r.id}>
                  <td data-label="Contact"><span className="font-medium text-text-primary">{r.name}</span>{r.primary ? <span className="ml-2"><StatusBadge tone="primary">Primary</StatusBadge></span> : null}<p className="text-xs text-text-muted">{r.title || ""}</p></td>
                  <td data-label="Client"><Link className="nx-link" href={"/crm/clients/" + r.clientId}>{r.client}</Link></td>
                  <td data-label="Email" className="text-text-secondary">{r.email ? <a className="hover:text-primary" href={`mailto:${r.email}`}>{r.email}</a> : "—"}</td>
                  <td data-label="Phone" className="whitespace-nowrap text-text-secondary">{r.phone ? <a className="hover:text-primary" href={`tel:${r.phone}`}>{r.phone}</a> : "—"}</td>
                  <td data-label="Department"><DepartmentChip name={r.departmentId ? labels.departments.get(r.departmentId) : null} /></td>
                </tr>
              ))}</tbody>
            </table>
          </TableCard>
        ) : <EmptyState icon={<Contact className="h-5 w-5" />} title="No contacts found" description="Contacts appear here once they are added to a client." />}
      </section>
    );
  }

  const where = and(scopeCondition(payments, financeScope(actor)), currency ? eq(payments.currencyCode, currency) : undefined, departmentId ? eq(payments.departmentId, departmentId) : undefined, clientId ? eq(payments.clientId, clientId) : undefined,
    status ? eq(payments.status, status) : undefined, from ? gte(payments.receivedAt, from) : undefined, to ? lt(payments.receivedAt, to) : undefined,
    search ? or(ilike(clients.name, search), ilike(payments.externalReference, search)) : undefined);
  const [rows, totals] = await Promise.all([
    db.select({ id: payments.id, clientId: clients.id, client: clients.name, date: payments.receivedAt, amount: payments.amountMinor, currency: payments.currencyCode, status: payments.status, method: payments.paymentMethod, reference: payments.externalReference, departmentId: payments.departmentId })
      .from(payments).innerJoin(clients, eq(clients.id, payments.clientId)).where(where).orderBy(desc(payments.receivedAt), desc(payments.id)).limit(PAGE_SIZE + 1).offset(offset),
    db.select({ status: payments.status, currency: payments.currencyCode, total: sql<string>`sum(${payments.amountMinor})`, count: sql<number>`count(*)`.mapWith(Number) })
      .from(payments).innerJoin(clients, eq(clients.id, payments.clientId)).where(where).groupBy(payments.status, payments.currencyCode),
  ]);
  const labels = await resolveLabels({ departments: rows.map((r) => r.departmentId) });
  const sum = (s: string) => totals.filter((t) => t.status === s).map((t) => ({ currency: t.currency, minor: t.total }));
  const count = (s: string) => totals.filter((t) => t.status === s).reduce((n, t) => n + t.count, 0);

  return (
    <section>
      <PageHeader eyebrow="Finance" title="Payments" description="Money received from clients. Only posted payments count toward revenue; reversed and refunded payments are excluded."
        actions={<Link href="/finance/invoices#record-payment" className="button-primary px-3 py-2 text-sm">Record payment</Link>} />
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Posted" value={formatCurrencies(sum("posted"))} hint={`${count("posted")} payments`} tone="primary" href={link({ status: "posted", page: undefined })} />
        <StatCard label="Refunded" value={formatCurrencies(sum("refunded"))} hint={`${count("refunded")} payments`} tone="warning" href={link({ status: "refunded", page: undefined })} />
        <StatCard label="Reversed" value={formatCurrencies(sum("reversed"))} hint={`${count("reversed")} payments`} tone="neutral" href={link({ status: "reversed", page: undefined })} />
      </div>
      <FilterBar>
        {clientId ? <input type="hidden" name="clientId" value={clientId} /> : null}
        <input aria-label="Search payments" className="input min-w-0 flex-1 basis-48" name="q" defaultValue={q} placeholder="Search client or reference" />
        <select aria-label="Status" name="status" defaultValue={status ?? ""} className="input w-auto"><option value="">All statuses</option>{PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</select>
        <select aria-label="Department" name="departmentId" defaultValue={departmentId ?? ""} className="input w-auto"><option value="">All departments</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        <input aria-label="From" type="date" name="from" defaultValue={keep.from} className="input w-auto" />
        <input aria-label="Through" type="date" name="to" defaultValue={keep.to} className="input w-auto" />
        <button className="button-secondary px-4 py-2 text-sm">Apply</button>
        {Object.values(keep).some(Boolean) ? <Link href="?" className="px-2 text-sm text-text-muted hover:text-primary">Clear</Link> : null}
      </FilterBar>
      {rows.length ? (
        <TableCard footer={<Nav page={page} more={rows.length > PAGE_SIZE} link={link} />}>
          <table className="data-table nx-record-list">
            <thead><tr><th>Client</th><th>Received</th><th>Method</th><th>Reference</th><th>Department</th><th>Status</th><th className="text-right">Amount</th></tr></thead>
            <tbody>{rows.slice(0, PAGE_SIZE).map((r) => (
              <tr key={r.id}>
                <td data-label="Client"><Link className="nx-link" href={"/crm/clients/" + r.clientId}>{r.client}</Link></td>
                <td data-label="Received" className="whitespace-nowrap text-text-secondary">{formatDate(r.date)}</td>
                <td data-label="Method" className="text-text-secondary">{humanize(r.method)}</td>
                <td data-label="Reference" className="text-text-secondary">{r.reference || "—"}</td>
                <td data-label="Department"><DepartmentChip name={r.departmentId ? labels.departments.get(r.departmentId) : null} /></td>
                <td data-label="Status"><StatusBadge status={r.status} /></td>
                <td data-label="Amount" className="whitespace-nowrap text-right font-medium tabular-nums">{formatMinor(r.amount, r.currency)}</td>
              </tr>
            ))}</tbody>
          </table>
        </TableCard>
      ) : <EmptyState icon={<Banknote className="h-5 w-5" />} title="No payments found" description="Record a payment against an issued invoice, or adjust the filters." />}
    </section>
  );
}

function Nav({ page, more, link }: { page: number; more: boolean; link: (changes: Record<string, string | undefined>) => string }) {
  if (page === 1 && !more) return null;
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between border-t border-border px-4 py-2.5 text-sm">
      <span className="text-xs text-text-muted">Page {page}</span>
      <div className="flex gap-1.5">
        {page > 1 ? <Link className="button-secondary button-sm" href={link({ page: String(page - 1) })}>Previous</Link> : null}
        {more ? <Link className="button-secondary button-sm" href={link({ page: String(page + 1) })}>Next</Link> : null}
      </div>
    </nav>
  );
}
