import { workspaceDepartments } from "@/features/crm/shared/departments";
import { TeamInvitations } from "@/features/people/components/TeamInvitations";
import { requirePageActor } from "@/lib/authorization/server";
import { Panel } from "@/components/nx";
import { formatMinor } from "@/lib/format";
import { Cashbook } from "./Cashbook";
import { FounderDashboard, type DashboardVariant } from "./FounderDashboard";
import { RecentAuditEvents } from "./RecentAuditEvents";
import type { DashboardMetrics } from "../types";

/** Shared renderer for /dashboard, /finance and /reports. */
export async function DashboardReportView({ data, action = "/dashboard" }: { data: DashboardMetrics; action?: string }) {
  const actor = await requirePageActor();
  const departments = data.departments ?? await workspaceDepartments(actor);
  const variant: DashboardVariant = action === "/finance" ? "finance" : action === "/reports" ? "reports" : "overview";
  const { leads } = data;

  return (
    <div className="space-y-8">
      <FounderDashboard data={data} departments={departments} variant={variant} userName={actor.name} extra={variant === "reports" ? <TeamInvitations actor={actor} /> : undefined} />

      {variant !== "overview" && (data.expenses || data.finance.available) ? <Cashbook data={data} /> : null}

      {variant !== "overview" && data.profit ? (
        <Panel id="ledger-summary" title="Ledger profit by department" description="Posted revenue and expense journal lines for the selected dates, including reversals.">
          {data.profit.length ? (
            <div className="nx-scroll-x"><table className="data-table"><thead><tr><th>Department</th><th>Net profit</th></tr></thead><tbody>
              {data.profit.map((row) => <tr key={(row.departmentId ?? "none") + row.currency}><td>{departments.find((d) => d.id === row.departmentId)?.name ?? "Unassigned / mixed"}</td><td className="tabular-nums">{formatMinor(row.amount, row.currency)}</td></tr>)}
            </tbody></table></div>
          ) : <p className="text-sm text-text-muted">No journal entries have been posted for this period, so ledger profit is not available. The overview shows cash-basis profit instead.</p>}
        </Panel>
      ) : null}

      {variant === "reports" && leads.available ? (
        <Panel id="lead-conversion" title="Conversion by ingestion channel" description="Cohort: leads created in the period, converted by the as-of date.">
          {leads.sourcePerformance?.length ? (
            <div className="nx-scroll-x"><table className="data-table"><thead><tr><th>Channel</th><th>New leads</th><th>Qualified</th><th>Converted</th><th>Rate</th></tr></thead><tbody>
              {leads.sourcePerformance.map((r) => <tr key={r.source}><td className="capitalize">{r.source}</td><td>{r.createdLeads}</td><td>{r.qualifiedSnapshot}</td><td>{r.convertedCohort}</td><td>{(r.conversionRate * 100).toFixed(1)}%</td></tr>)}
            </tbody></table></div>
          ) : <p className="text-sm text-text-muted">No leads were created in this period.</p>}
        </Panel>
      ) : null}

      {variant === "reports" && data.auditEvents ? <div id="recent-activity"><RecentAuditEvents events={data.auditEvents} /></div> : null}
    </div>
  );
}
