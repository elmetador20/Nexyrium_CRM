import Link from "next/link";
import { FilterChip } from "@/components/nx/FilterChip";
import { Handshake, KanbanSquare, Plus } from "lucide-react";

import { dealRepository } from "@/features/crm/deals/queries";
import { createDealService } from "@/features/crm/deals/services";
import { workspaceDepartments } from "@/features/crm/shared/departments";
import { DepartmentChip, EmptyState, FilterBar, PageHeader, Pager, StatusBadge, TableCard } from "@/components/nx";
import { recordAuditEvent } from "@/lib/audit/service";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { can } from "@/lib/authorization/policy";
import { requirePagePermission } from "@/lib/authorization/server";
import { formatDate, formatMajor, humanize } from "@/lib/format";
import { label, resolveLabels } from "@/lib/labels";
import { DEAL_STAGES } from "@/types/crm";

export const instant = false;
const service = createDealService({ repository: dealRepository, audit: recordAuditEvent });
const PAGE_SIZE = 20;

export default async function DealsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePagePermission(PERMISSIONS.CRM_DEALS_READ);
  const params = await searchParams;
  const search = typeof params.search === "string" ? params.search : undefined;
  const stage = DEAL_STAGES.find((s) => s === params.stage);
  const departmentId = typeof params.departmentId === "string" && params.departmentId ? params.departmentId : undefined;
  const page = Math.max(1, Math.floor(Number(params.page)) || 1);
  const [result, departments] = await Promise.all([service.list(actor, { search, stage, departmentId, page, pageSize: PAGE_SIZE }), workspaceDepartments(actor)]);
  const labels = await resolveLabels({ users: result.items.map((d) => d.ownerId), departments: result.items.map((d) => d.departmentId), clients: result.items.map((d) => d.clientId) });
  const pages = Math.ceil(result.total / PAGE_SIZE);
  const href = (p: number) => "?" + new URLSearchParams(Object.entries({ search, stage, departmentId, page: String(p) }).filter((e): e is [string, string] => Boolean(e[1])));
  const canCreate = can(actor, PERMISSIONS.CRM_DEALS_CREATE);

  return (
    <section>
      <PageHeader eyebrow="CRM" title="Deals" description={`${result.total} deal${result.total === 1 ? "" : "s"}${stage ? ` · ${humanize(stage)}` : ""} · contracted value is separate from collected revenue`}
        actions={<>
          <Link href="/crm/pipeline" className="button-secondary inline-flex items-center gap-1.5 px-3 py-2 text-sm"><KanbanSquare className="h-4 w-4" aria-hidden />Board</Link>
          {canCreate ? <Link href="/crm/deals/new" className="button-primary inline-flex items-center gap-1.5 px-3 py-2 text-sm"><Plus className="h-4 w-4" aria-hidden />New deal</Link> : null}
        </>} />
      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter by stage">
        {[undefined, ...DEAL_STAGES].map((s) => {
          const active = stage === s;
          const query = new URLSearchParams(Object.entries({ search, departmentId, stage: s }).filter((e): e is [string, string] => Boolean(e[1])));
          return <FilterChip key={s ?? "all"} href={`?${query}`} active={active} variant="pill">{s ? humanize(s) : "All"}</FilterChip>;
        })}
      </div>
      <FilterBar>
        {stage ? <input type="hidden" name="stage" value={stage} /> : null}
        <input name="search" defaultValue={search} placeholder="Search deal title" aria-label="Search deals" className="input min-w-0 flex-1 basis-56" />
        <select aria-label="Department" name="departmentId" defaultValue={departmentId ?? ""} className="input w-auto"><option value="">All departments</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        <button className="button-secondary px-4 py-2 text-sm" type="submit">Apply</button>
      </FilterBar>
      {result.items.length === 0 ? (
        <EmptyState icon={<Handshake className="h-5 w-5" />} title="No deals found" description="Create a deal or adjust the filters." action={canCreate ? <Link href="/crm/deals/new" className="button-primary px-4 py-2 text-sm">New deal</Link> : undefined} />
      ) : (
        <TableCard footer={<Pager page={page} pages={pages} total={result.total} href={href} />}>
          <table className="data-table">
            <thead><tr><th>Deal</th><th>Stage</th><th className="text-right">Value</th><th>Department</th><th>Owner</th><th>Expected close</th></tr></thead>
            <tbody>
              {result.items.map((deal) => (
                <tr key={deal.id}>
                  <td><Link href={`/crm/deals/${deal.id}`} className="nx-link">{deal.title}</Link><p className="text-xs text-text-muted">{deal.clientId ? label(labels.clients, deal.clientId) : "No client linked"}</p></td>
                  <td><StatusBadge status={deal.stage} /></td>
                  <td className="whitespace-nowrap text-right font-medium tabular-nums">{formatMajor(deal.expectedValue, deal.currency)}</td>
                  <td><DepartmentChip name={deal.departmentId ? labels.departments.get(deal.departmentId) : null} /></td>
                  <td className="text-text-secondary">{label(labels.users, deal.ownerId)}</td>
                  <td className="whitespace-nowrap text-text-secondary">{formatDate(deal.expectedCloseDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}
    </section>
  );
}
