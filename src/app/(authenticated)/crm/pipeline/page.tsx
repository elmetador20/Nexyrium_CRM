import Link from "next/link";
import { FilterChip } from "@/components/nx/FilterChip";
import { Plus } from "lucide-react";

import { dealRepository } from "@/features/crm/deals/queries";
import { createDealService } from "@/features/crm/deals/services";
import { StageSelect } from "@/features/crm/deals/components/StageSelect";
import { workspaceDepartments } from "@/features/crm/shared/departments";
import { DepartmentChip, PageHeader } from "@/components/nx";
import { recordAuditEvent } from "@/lib/audit/service";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { can } from "@/lib/authorization/policy";
import { requirePagePermission } from "@/lib/authorization/server";
import { formatDate, formatMajor, formatMinor, humanize, majorToMinorString, sumByCurrency } from "@/lib/format";
import { label, resolveLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";

export const instant = false;
const service = createDealService({ repository: dealRepository, audit: recordAuditEvent });
const STAGES = ["prospecting", "qualified", "proposal", "negotiation", "won", "lost"] as const;
const OPEN_COUNT = 4;
const accent: Record<string, string> = { prospecting: "bg-info", qualified: "bg-secondary", proposal: "bg-accent", negotiation: "bg-warning", won: "bg-success", lost: "bg-danger" };

export default async function PipelinePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePagePermission(PERMISSIONS.CRM_DEALS_READ);
  const params = await searchParams;
  const departmentId = typeof params.departmentId === "string" && params.departmentId ? params.departmentId : undefined;
  const [departments, columns] = await Promise.all([
    workspaceDepartments(actor),
    Promise.all(STAGES.map((stage) => service.list(actor, { stage, departmentId, page: 1, pageSize: 100 }))),
  ]);
  const all = columns.flatMap((c) => c.items);
  const labels = await resolveLabels({ users: all.map((d) => d.ownerId), departments: all.map((d) => d.departmentId), clients: all.map((d) => d.clientId) });
  const open = columns.slice(0, OPEN_COUNT).flatMap((c) => c.items);
  const openTotals = sumByCurrency(open.map((d) => ({ currency: d.currency, minor: majorToMinorString(d.expectedValue) })));
  const canEdit = can(actor, PERMISSIONS.CRM_DEALS_UPDATE);

  return (
    <section>
      <PageHeader eyebrow="CRM" title="Pipeline"
        description={<>Open pipeline <strong className="text-text-primary">{openTotals.length ? openTotals.map((t) => formatMinor(t.minor, t.currency)).join(" · ") : formatMinor("0", "INR")}</strong> across {open.length} deal{open.length === 1 ? "" : "s"} · won and lost deals are excluded from pipeline value</>}
        actions={can(actor, PERMISSIONS.CRM_DEALS_CREATE) ? <Link href="/crm/deals/new" className="button-primary inline-flex items-center gap-1.5 px-3 py-2 text-sm"><Plus className="h-4 w-4" aria-hidden />New deal</Link> : null} />
      {departments.length ? (
        <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Department">
          {[{ id: "", name: "All departments" }, ...departments].map((d) => {
            const active = (departmentId ?? "") === d.id;
            return <FilterChip key={d.id || "all"} href={d.id ? `?departmentId=${d.id}` : "?"} active={active} variant="pill">{d.name}</FilterChip>;
          })}
        </div>
      ) : null}
      <div className="nx-scroll-x -mx-4 px-4 pb-2 sm:mx-0 sm:px-0">
        <div className="grid min-w-[1080px] grid-cols-6 gap-3">
          {STAGES.map((stage, index) => {
            const deals = columns[index].items;
            const totals = sumByCurrency(deals.map((d) => ({ currency: d.currency, minor: majorToMinorString(d.expectedValue) })));
            return (
              <div key={stage} id={stage} className={cn("flex min-h-[420px] flex-col rounded-[14px] border border-border", index >= OPEN_COUNT ? "bg-surface-muted/50" : "bg-surface-muted")}>
                <div className="border-b border-border px-3 py-2.5">
                  <div className="flex items-center gap-2"><span className={cn("h-2 w-2 rounded-full", accent[stage])} aria-hidden /><h2 className="text-sm font-semibold text-text-primary">{humanize(stage)}</h2><span className="ml-auto rounded-full bg-surface px-2 text-xs text-text-muted">{columns[index].total}</span></div>
                  <p className="mt-0.5 text-xs tabular-nums text-text-muted">{totals.length ? totals.map((t) => formatMinor(t.minor, t.currency)).join(" · ") : "—"}</p>
                </div>
                <ul className="flex-1 space-y-2 p-2">
                  {deals.map((deal) => (
                    <li key={deal.id} className="rounded-xl border border-border bg-surface p-3 shadow-[0_1px_2px_rgb(24_35_31/5%)]">
                      <Link href={`/crm/deals/${deal.id}`} className="nx-link block text-sm leading-snug">{deal.title}</Link>
                      <p className="mt-0.5 truncate text-xs text-text-muted">{deal.clientId ? label(labels.clients, deal.clientId) : "No client"}</p>
                      <p className="mt-2 text-sm font-semibold tabular-nums text-text-primary">{formatMajor(deal.expectedValue, deal.currency)}</p>
                      <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-text-muted">
                        <DepartmentChip name={deal.departmentId ? labels.departments.get(deal.departmentId) : null} />
                        <span>{deal.expectedCloseDate ? formatDate(deal.expectedCloseDate) : ""}</span>
                      </div>
                      <p className="mt-1 truncate text-xs text-text-muted">{label(labels.users, deal.ownerId)}</p>
                      {canEdit ? <div className="mt-2"><StageSelect dealId={deal.id} stage={deal.stage} /></div> : null}
                    </li>
                  ))}
                  {!deals.length ? <li className="px-2 py-8 text-center text-xs text-text-muted">No deals</li> : null}
                  {columns[index].total > deals.length ? <li className="px-2 text-center text-xs"><Link className="text-primary hover:underline" href={`/crm/deals?stage=${stage}`}>View all {columns[index].total}</Link></li> : null}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
