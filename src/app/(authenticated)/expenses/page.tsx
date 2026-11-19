import Link from "next/link";
import { Plus, ReceiptText } from "lucide-react";

import { expenseService } from "@/features/accounting/server";
import { workspaceDepartments } from "@/features/crm/shared/departments";
import { DepartmentChip, EmptyState, FilterBar, PageHeader, Pager, StatCard, StatusBadge, TableCard } from "@/components/nx";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { can } from "@/lib/authorization/policy";
import { requirePagePermission } from "@/lib/authorization/server";
import { formatCurrencies, formatDate, formatMinor, humanize } from "@/lib/format";
import { resolveLabels } from "@/lib/labels";

export const instant = false;
const PAGE_SIZE = 50;
const STATUSES = ["draft", "submitted", "approved", "rejected"] as const;

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requirePagePermission(PERMISSIONS.EXPENSES_READ);
  const q = await searchParams;
  const page = Math.max(1, Math.floor(Number(q.page)) || 1);
  const status = STATUSES.find((s) => s === q.status);
  const filters = { search: q.search || undefined, from: q.from || undefined, to: q.to || undefined, status, departmentId: q.departmentId || undefined };
  const [result, departments] = await Promise.all([
    expenseService.list(actor, { page, pageSize: PAGE_SIZE, ...filters, includedOnly: q.includedOnly === "1" }),
    workspaceDepartments(actor),
  ]);
  const labels = await resolveLabels({ departments: result.items.map((e) => e.departmentId) });
  const link = (p: number) => "?" + new URLSearchParams(Object.entries({ ...filters, includedOnly: q.includedOnly, page: String(p) }).filter((e): e is [string, string] => Boolean(e[1])));
  const recorded = result.items.filter((e) => e.status === "submitted" || e.status === "approved").map((e) => ({ currency: e.currencyCode, minor: e.amountMinor }));
  const pending = result.items.filter((e) => e.status === "submitted").length;

  return (
    <section>
      <PageHeader eyebrow="Finance" title="Expenses" description="Company spending by department. Submitted and approved expenses count toward totals; drafts and rejected ones do not."
        actions={can(actor, PERMISSIONS.EXPENSES_CREATE) ? <Link className="button-primary inline-flex items-center gap-1.5 px-3 py-2 text-sm" href="/expenses/new"><Plus className="h-4 w-4" aria-hidden />New expense</Link> : null} />
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Recorded on this page" value={formatCurrencies(recorded)} hint="Submitted & approved" tone="accent" />
        <StatCard label="Awaiting approval" value={String(pending)} hint="Submitted expenses on this page" tone="warning" href="?status=submitted" />
        <StatCard label="Matching records" value={String(result.total)} hint={filters.from || filters.to ? `${formatDate(filters.from)} – ${formatDate(filters.to)}` : "All dates"} tone="neutral" />
      </div>
      <FilterBar>
        <input className="input min-w-0 flex-1 basis-48" name="search" aria-label="Search expenses" placeholder="Search title, merchant or category" defaultValue={q.search} />
        <select aria-label="Status" name="status" defaultValue={status ?? ""} className="input w-auto"><option value="">All statuses</option>{STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</select>
        <select aria-label="Department" name="departmentId" defaultValue={q.departmentId ?? ""} className="input w-auto"><option value="">All departments</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        <input aria-label="From" className="input w-auto" type="date" name="from" defaultValue={q.from} />
        <input aria-label="Through" className="input w-auto" type="date" name="to" defaultValue={q.to} />
        <button className="button-secondary px-4 py-2 text-sm">Apply</button>
        {Object.values(filters).some(Boolean) ? <Link href="?" className="px-2 text-sm text-text-muted hover:text-primary">Clear</Link> : null}
      </FilterBar>
      {result.items.length === 0 ? (
        <EmptyState icon={<ReceiptText className="h-5 w-5" />} title="No expenses found" description="Record an expense to track spending by department." action={can(actor, PERMISSIONS.EXPENSES_CREATE) ? <Link className="button-primary px-4 py-2 text-sm" href="/expenses/new">New expense</Link> : undefined} />
      ) : (
        <TableCard footer={<Pager page={page} pages={Math.ceil(result.total / PAGE_SIZE)} total={result.total} href={link} />}>
          <table className="data-table">
            <thead><tr><th>Date</th><th>Expense</th><th>Category</th><th>Department</th><th>Status</th><th className="text-right">Amount</th></tr></thead>
            <tbody>
              {result.items.map((expense) => (
                <tr key={expense.id}>
                  <td className="whitespace-nowrap text-text-secondary">{formatDate(expense.incurredOn)}</td>
                  <td><Link className="nx-link" href={`/expenses/${expense.id}`}>{expense.description}</Link>{expense.merchantName ? <p className="text-xs text-text-muted">{expense.merchantName}</p> : null}</td>
                  <td className="text-text-secondary">{expense.category}</td>
                  <td><DepartmentChip name={expense.departmentId ? labels.departments.get(expense.departmentId) : null} /></td>
                  <td><StatusBadge status={expense.status} /></td>
                  <td className="whitespace-nowrap text-right font-medium tabular-nums">{formatMinor(expense.amountMinor, expense.currencyCode)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}
    </section>
  );
}
