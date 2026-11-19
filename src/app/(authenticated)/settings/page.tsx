import Link from "next/link";
import { asc, count } from "drizzle-orm";
import { Building, HardDrive, Plug, Target, UserCircle, Users } from "lucide-react";

import { db } from "@/db";
import { clients, deals, departments, expenses, leads, userDepartments } from "@/db/schema";
import { DepartmentForm } from "@/features/settings/DepartmentForm";
import { PageHeader, Panel } from "@/components/nx";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { can } from "@/lib/authorization/policy";
import { requirePagePermission } from "@/lib/authorization/server";

export const instant = false;

async function countBy(table: typeof leads | typeof clients | typeof deals | typeof expenses) {
  const rows = await db.select({ id: table.departmentId, n: count() }).from(table).groupBy(table.departmentId);
  return new Map(rows.map((r) => [r.id, Number(r.n)]));
}

export default async function SettingsPage() {
  const actor = await requirePagePermission(PERMISSIONS.SETTINGS_READ);
  const [list, leadCounts, clientCounts, dealCounts, expenseCounts, memberRows] = await Promise.all([
    db.select({ id: departments.id, name: departments.name }).from(departments).orderBy(asc(departments.name)),
    countBy(leads), countBy(clients), countBy(deals), countBy(expenses),
    db.select({ id: userDepartments.departmentId, n: count() }).from(userDepartments).groupBy(userDepartments.departmentId),
  ]);
  const members = new Map(memberRows.map((r) => [r.id, Number(r.n)]));
  const workspace = process.env.WORKSPACE_DISPLAY_NAME || "Nexyrium";
  const links = [
    can(actor, PERMISSIONS.PEOPLE_READ) && { href: "/people", title: "Team directory", body: "Teammates, roles and workspace access.", Icon: Users },
    can(actor, PERMISSIONS.REPORTS_READ) && { href: "/targets", title: "Targets", body: "Monthly goals per department.", Icon: Target },
    { href: "/settings/profile", title: "Your profile", body: "Account details and session controls.", Icon: UserCircle },
    { href: "/settings/integrations/google-drive", title: "Google Drive", body: "Receipt storage in your Drive folder.", Icon: HardDrive },
    can(actor, PERMISSIONS.INTEGRATIONS_META_READ) && { href: "/settings/integrations/meta", title: "Meta Lead Ads", body: "Lead Ads readiness and delivery status.", Icon: Plug },
  ].filter(Boolean) as Array<{ href: string; title: string; body: string; Icon: typeof Users }>;

  return (
    <section className="mx-auto max-w-5xl">
      <PageHeader eyebrow="Workspace" title={`${workspace} settings`} description="Workspace configuration, departments and connected services." />
      <div className="grid gap-3 sm:grid-cols-2">
        {links.map(({ href, title, body, Icon }) => (
          <Link key={href} href={href} className="nx-card-interactive flex items-start gap-3 rounded-[14px] border border-border bg-surface p-4">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-light text-primary" aria-hidden><Icon className="h-4 w-4" /></span>
            <span><span className="block font-semibold text-text-primary">{title}</span><span className="text-sm text-text-secondary">{body}</span></span>
          </Link>
        ))}
      </div>
      <Panel className="mt-6" title={<span className="flex items-center gap-2"><Building className="h-4 w-4 text-primary" aria-hidden />Departments</span>} description="Leads, clients, deals and expenses can optionally be assigned to a department for filtering and reporting.">
        <div className="nx-scroll-x">
          <table className="data-table">
            <thead><tr><th>Department</th><th>Members</th><th>Leads</th><th>Clients</th><th>Deals</th><th>Expenses</th></tr></thead>
            <tbody>
              {list.map((d) => (
                <tr key={d.id}>
                  <td className="font-medium text-text-primary">{d.name}</td>
                  <td>{members.get(d.id) ?? 0}</td>
                  <td><Link className="nx-link" href={`/crm/leads?departmentId=${d.id}`}>{leadCounts.get(d.id) ?? 0}</Link></td>
                  <td><Link className="nx-link" href={`/crm/clients?departmentId=${d.id}`}>{clientCounts.get(d.id) ?? 0}</Link></td>
                  <td><Link className="nx-link" href={`/crm/deals?departmentId=${d.id}`}>{dealCounts.get(d.id) ?? 0}</Link></td>
                  <td><Link className="nx-link" href={`/expenses?departmentId=${d.id}`}>{expenseCounts.get(d.id) ?? 0}</Link></td>
                </tr>
              ))}
              <tr><td className="text-text-muted">Unassigned</td><td>—</td><td>{leadCounts.get(null) ?? 0}</td><td>{clientCounts.get(null) ?? 0}</td><td>{dealCounts.get(null) ?? 0}</td><td>{expenseCounts.get(null) ?? 0}</td></tr>
            </tbody>
          </table>
        </div>
        {can(actor, PERMISSIONS.SETTINGS_MANAGE) ? <div className="mt-4 border-t border-border pt-4"><p className="mb-2 text-sm font-medium text-text-primary">Add a department</p><DepartmentForm /></div> : null}
      </Panel>
    </section>
  );
}
