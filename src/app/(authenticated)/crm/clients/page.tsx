import Link from "next/link";
import { Building2, Plus } from "lucide-react";

import { clientRepository } from "@/features/crm/clients/queries";
import { createClientService } from "@/features/crm/clients/services";
import { workspaceDepartments } from "@/features/crm/shared/departments";
import { DepartmentChip, EmptyState, FilterBar, PageHeader, Pager, TableCard } from "@/components/nx";
import { recordAuditEvent } from "@/lib/audit/service";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { can } from "@/lib/authorization/policy";
import { requirePagePermission } from "@/lib/authorization/server";
import { formatDate } from "@/lib/format";
import { resolveLabels } from "@/lib/labels";

export const instant = false;
const service = createClientService({ repository: clientRepository, audit: recordAuditEvent });
const PAGE_SIZE = 20;

export default async function ClientsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePagePermission(PERMISSIONS.CRM_CLIENTS_READ);
  const params = await searchParams;
  const search = typeof params.search === "string" ? params.search : undefined;
  const departmentId = typeof params.departmentId === "string" && params.departmentId ? params.departmentId : undefined;
  const page = Math.max(1, Math.floor(Number(params.page)) || 1);
  const [result, departments] = await Promise.all([service.list(actor, { search, departmentId, page, pageSize: PAGE_SIZE }), workspaceDepartments(actor)]);
  const labels = await resolveLabels({ departments: result.items.map((c) => c.departmentId) });
  const pages = Math.ceil(result.total / PAGE_SIZE);
  const href = (p: number) => "?" + new URLSearchParams(Object.entries({ search, departmentId, page: String(p) }).filter((e): e is [string, string] => Boolean(e[1])));
  const canCreate = can(actor, PERMISSIONS.CRM_CLIENTS_CREATE);

  return (
    <section>
      <PageHeader eyebrow="CRM" title="Clients" description={`${result.total} active client${result.total === 1 ? "" : "s"} · companies you work with`}
        actions={canCreate ? <Link href="/crm/clients/new" className="button-primary inline-flex items-center gap-1.5 px-3 py-2 text-sm"><Plus className="h-4 w-4" aria-hidden />New client</Link> : null} />
      <FilterBar>
        <input name="search" defaultValue={search} placeholder="Search name, company, email or phone" aria-label="Search clients" className="input min-w-0 flex-1 basis-56" />
        <select aria-label="Department" name="departmentId" defaultValue={departmentId ?? ""} className="input w-auto"><option value="">All departments</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        <button className="button-secondary px-4 py-2 text-sm" type="submit">Apply</button>
        {search || departmentId ? <Link href="?" className="px-2 text-sm text-text-muted hover:text-primary">Clear</Link> : null}
      </FilterBar>
      {result.items.length === 0 ? (
        <EmptyState icon={<Building2 className="h-5 w-5" />} title="No clients found" description="Add a client or convert a qualified lead to start building relationships." action={canCreate ? <Link href="/crm/clients/new" className="button-primary px-4 py-2 text-sm">New client</Link> : undefined} />
      ) : (
        <TableCard footer={<Pager page={page} pages={pages} total={result.total} href={href} />}>
          <table className="data-table">
            <thead><tr><th>Client</th><th>Phone</th><th>Email</th><th>Department</th><th>Owner</th><th>Since</th></tr></thead>
            <tbody>
              {result.items.map((client) => (
                <tr key={client.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary-light text-xs font-semibold text-primary" aria-hidden>{client.name.slice(0, 2).toUpperCase()}</span>
                      <span className="min-w-0"><Link href={`/crm/clients/${client.id}`} className="nx-link">{client.name}</Link><span className="block truncate text-xs text-text-muted">{client.companyName ?? "—"}</span></span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap text-text-secondary">{client.phone ? <a href={`tel:${client.phone}`} className="hover:text-primary">{client.phone}</a> : "—"}</td>
                  <td className="text-text-secondary">{client.email ? <a href={`mailto:${client.email}`} className="hover:text-primary">{client.email}</a> : "—"}</td>
                  <td><DepartmentChip name={client.departmentId ? labels.departments.get(client.departmentId) : null} /></td>
                  <td className="text-text-secondary">{client.ownerName ?? "Unassigned"}</td>
                  <td className="whitespace-nowrap text-text-secondary">{formatDate(client.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}
    </section>
  );
}
