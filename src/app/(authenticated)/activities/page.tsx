import Link from "next/link";
import { and, count, desc, eq, gte, lt } from "drizzle-orm";
import { Activity } from "lucide-react";

import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { EmptyState, FilterBar, PageHeader, Pager, StatusBadge, TableCard } from "@/components/nx";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { requirePagePermission } from "@/lib/authorization/server";
import { formatDate, humanize } from "@/lib/format";

export const instant = false;
const PAGE_SIZE = 50;

const RESOURCE_LINKS: Record<string, (id: string) => string> = {
  lead: (id) => `/crm/leads/${id}`, client: (id) => `/crm/clients/${id}`, deal: (id) => `/crm/deals/${id}`,
  invoice: (id) => `/finance/invoices/${id}`, quotation: (id) => `/quotations/${id}`, expense: (id) => `/expenses/${id}`,
  project: (id) => `/projects/${id}`,
};

function describe(action: string) {
  const parts = action.split(".");
  const verb = humanize(parts.at(-1) ?? action).toLowerCase();
  const noun = (parts.at(-2) ?? "").replaceAll("_", " ");
  return `${verb} ${noun}`.trim();
}

export default async function ActivitiesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePagePermission(PERMISSIONS.AUDIT_LOGS_READ);
  const q = await searchParams;
  const page = Math.max(1, Math.floor(Number(q.page)) || 1);
  const day = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + "T00:00:00Z") : undefined);
  const from = day(q.from);
  const to = day(q.to);
  if (to) to.setUTCDate(to.getUTCDate() + 1);
  const types = await db.selectDistinct({ type: auditLogs.resourceType }).from(auditLogs).orderBy(auditLogs.resourceType);
  const type = types.find((t) => t.type === q.type)?.type;
  const where = and(type ? eq(auditLogs.resourceType, type) : undefined, from ? gte(auditLogs.createdAt, from) : undefined, to ? lt(auditLogs.createdAt, to) : undefined);
  const [rows, [{ total }]] = await Promise.all([
    db.select({ id: auditLogs.id, action: auditLogs.action, resourceType: auditLogs.resourceType, resourceId: auditLogs.resourceId, outcome: auditLogs.outcome, createdAt: auditLogs.createdAt, actorId: auditLogs.actorUserId, actorName: users.name, actorEmail: users.email })
      .from(auditLogs).leftJoin(users, eq(users.id, auditLogs.actorUserId)).where(where).orderBy(desc(auditLogs.createdAt), desc(auditLogs.id)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(auditLogs).where(where),
  ]);
  const filters = { type, from: q.from, to: q.to };
  const href = (p: number) => "?" + new URLSearchParams(Object.entries({ ...filters, page: String(p) }).filter((e): e is [string, string] => Boolean(e[1])));

  return (
    <section>
      <PageHeader eyebrow="Work" title="Activities" description="Everything that happened across the workspace — who did what, and when." />
      <FilterBar>
        <select aria-label="Record type" name="type" defaultValue={type ?? ""} className="input w-auto"><option value="">All record types</option>{types.map((t) => <option key={t.type} value={t.type}>{humanize(t.type)}</option>)}</select>
        <input aria-label="From" type="date" name="from" defaultValue={q.from} className="input w-auto" />
        <input aria-label="Through" type="date" name="to" defaultValue={q.to} className="input w-auto" />
        <button className="button-secondary px-4 py-2 text-sm">Apply</button>
        {Object.values(filters).some(Boolean) ? <Link href="?" className="px-2 text-sm text-text-muted hover:text-primary">Clear</Link> : null}
      </FilterBar>
      {rows.length ? (
        <TableCard footer={<Pager page={page} pages={Math.ceil(Number(total) / PAGE_SIZE)} total={Number(total)} href={href} />}>
          <table className="data-table nx-record-list">
            <thead><tr><th>When</th><th>Who</th><th>Activity</th><th>Record</th><th>Outcome</th></tr></thead>
            <tbody>
              {rows.map((row) => {
                const link = row.resourceId && RESOURCE_LINKS[row.resourceType] ? RESOURCE_LINKS[row.resourceType](row.resourceId) : null;
                return (
                  <tr key={row.id}>
                    <td data-label="When" className="whitespace-nowrap text-text-secondary">{formatDate(row.createdAt, true)}</td>
                    <td data-label="Who" className="font-medium text-text-primary">{row.actorName || row.actorEmail || (row.actorId ? "Former teammate" : "System")}</td>
                    <td data-label="Activity" className="text-text-secondary">{describe(row.action)}</td>
                    <td data-label="Record">{link ? <Link className="nx-link" href={link}>Open {humanize(row.resourceType).toLowerCase()}</Link> : <span className="text-text-muted">{humanize(row.resourceType)}</span>}</td>
                    <td data-label="Outcome"><StatusBadge status={row.outcome} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableCard>
      ) : <EmptyState icon={<Activity className="h-5 w-5" />} title="No activity found" description="Actions taken in the workspace will appear here." />}
    </section>
  );
}
