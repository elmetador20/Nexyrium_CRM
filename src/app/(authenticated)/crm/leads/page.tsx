import Link from "next/link";
import { FilterChip } from "@/components/nx/FilterChip";
import { Plus, Upload, UserPlus } from "lucide-react";

import { ACQUISITION_SOURCES, ACQUISITION_LABELS, parseAcquisitionSource } from "@/features/crm/leads/acquisition-source";
import { leadRepository } from "@/features/crm/leads/queries";
import { createLeadService } from "@/features/crm/leads/services";
import { workspaceDepartments } from "@/features/crm/shared/departments";
import { DepartmentChip, EmptyState, FilterBar, PageHeader, Pager, StatusBadge, TableCard } from "@/components/nx";
import { recordAuditEvent } from "@/lib/audit/service";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { can } from "@/lib/authorization/policy";
import { requirePagePermission } from "@/lib/authorization/server";
import { formatDate, humanize } from "@/lib/format";
import { label, resolveLabels } from "@/lib/labels";
import { LEAD_STATUSES } from "@/types/crm";

export const instant = false;

const service = createLeadService({ repository: leadRepository, audit: recordAuditEvent });
const PAGE_SIZE = 20;

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePagePermission(PERMISSIONS.CRM_LEADS_READ);
  const params = await searchParams;
  const text = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : undefined);
  const search = text("search");
  const status = LEAD_STATUSES.find((s) => s === text("status"));
  const departmentId = text("departmentId") || undefined;
  const page = Math.max(1, Math.floor(Number(text("page"))) || 1);
  const acquisitionSource = parseAcquisitionSource(text("acquisitionSource"));
  const [result, departments] = await Promise.all([
    service.list(actor, { search, status, acquisitionSource, departmentId, page, pageSize: PAGE_SIZE }),
    workspaceDepartments(actor),
  ]);
  const labels = await resolveLabels({ users: result.items.map((l) => l.ownerId), departments: result.items.map((l) => l.departmentId) });
  const pages = Math.ceil(result.total / PAGE_SIZE);
  const href = (p: number) => "?" + new URLSearchParams(Object.entries({ search, status, departmentId, acquisitionSource, page: String(p) }).filter((e): e is [string, string] => Boolean(e[1])));
  const canCreate = can(actor, PERMISSIONS.CRM_LEADS_CREATE);

  return (
    <section>
      <PageHeader
        eyebrow="CRM"
        title="Leads"
        description={`${result.total} open lead${result.total === 1 ? "" : "s"} · prospects, sources and follow-ups`}
        actions={canCreate ? <>
          <Link href="/crm/leads/import" className="button-secondary inline-flex items-center gap-1.5 px-3 py-2 text-sm"><Upload className="h-4 w-4" aria-hidden />Import</Link>
          <Link href="/crm/leads/new" className="button-primary inline-flex items-center gap-1.5 px-3 py-2 text-sm"><Plus className="h-4 w-4" aria-hidden />New lead</Link>
        </> : null}
      />
      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
        {[undefined, ...LEAD_STATUSES].map((s) => {
          const active = status === s;
          const query = new URLSearchParams(Object.entries({ search, departmentId, acquisitionSource, status: s }).filter((e): e is [string, string] => Boolean(e[1])));
          return <FilterChip key={s ?? "all"} href={`?${query}`} active={active} variant="pill">{s ? humanize(s) : "All"}</FilterChip>;
        })}
      </div>
      <FilterBar>
        {status ? <input type="hidden" name="status" value={status} /> : null}
        <input name="search" defaultValue={search} placeholder="Search name, company, email or phone" aria-label="Search leads" className="input min-w-0 flex-1 basis-56" />
        <select aria-label="Department" name="departmentId" defaultValue={departmentId ?? ""} className="input w-auto"><option value="">All departments</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        <select aria-label="Acquisition source" name="acquisitionSource" defaultValue={acquisitionSource ?? ""} className="input w-auto"><option value="">All sources</option>{ACQUISITION_SOURCES.map((k) => <option key={k} value={k}>{ACQUISITION_LABELS[k]}</option>)}</select>
        <button className="button-secondary px-4 py-2 text-sm" type="submit">Apply</button>
        {search || departmentId || acquisitionSource ? <Link href={status ? `?status=${status}` : "?"} className="px-2 text-sm text-text-muted hover:text-primary">Clear</Link> : null}
      </FilterBar>
      {result.items.length === 0 ? (
        <EmptyState icon={<UserPlus className="h-5 w-5" />} title="No leads found" description="Create a lead, import a spreadsheet, or adjust the filters." action={canCreate ? <Link href="/crm/leads/new" className="button-primary px-4 py-2 text-sm">New lead</Link> : undefined} />
      ) : (
        <TableCard footer={<Pager page={page} pages={pages} total={result.total} href={href} />}>
          <table className="data-table">
            <thead><tr><th>Lead</th><th>Status</th><th>Department</th><th>Source</th><th>Owner</th><th>Next follow-up</th></tr></thead>
            <tbody>
              {result.items.map((lead) => (
                <tr key={lead.id}>
                  <td>
                    <Link href={`/crm/leads/${lead.id}`} className="nx-link">{lead.contactName}</Link>
                    <p className="text-xs text-text-muted">{[lead.companyName, lead.phone ?? lead.email].filter(Boolean).join(" · ") || "No company"}</p>
                  </td>
                  <td><StatusBadge status={lead.status} /></td>
                  <td><DepartmentChip name={lead.departmentId ? labels.departments.get(lead.departmentId) : null} /></td>
                  <td className="text-text-secondary">{"acquisitionSource" in lead && lead.acquisitionSource ? ACQUISITION_LABELS[lead.acquisitionSource as keyof typeof ACQUISITION_LABELS] ?? humanize(String(lead.acquisitionSource)) : humanize(lead.source)}</td>
                  <td className="text-text-secondary">{label(labels.users, lead.ownerId)}</td>
                  <td className="text-text-secondary">{lead.nextActionAt ? <><span className="block text-text-primary">{lead.nextAction || "Follow up"}</span><span className="text-xs">{formatDate(lead.nextActionAt, true)}</span></> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}
    </section>
  );
}
