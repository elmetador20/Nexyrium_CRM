import type { DashboardMetrics } from "../types";
import { formatMoney } from "@/features/finance/shared/money";

function money(value: bigint, currency: string) {
  return value < BigInt(0) ? "−" + formatMoney(-value, currency) : formatMoney(value, currency);
}

export function Cashbook({data}: {data: DashboardMetrics}) {
  const credits = data.finance.dailyCredits ?? [];
  const expenses = data.expenses ?? [];
  const currencies = new Set([...credits, ...expenses].map(row => row.currency));
  return <section id="daily-cashbook" className="space-y-4"><h2 className="text-xl font-semibold">Daily cashbook</h2>
    <p className="text-sm text-text-secondary">Client receipts by date received and expenses by date incurred. Counts submitted and approved expenses; drafts and rejected expenses are excluded.</p>
    {!currencies.size && <p className="panel">No entries in this period.</p>}
    {[...currencies].sort().map(currency => {
      const daily = new Map<string, {credit: bigint; expense: bigint}>();
      const categories = new Map<string, bigint>();
      function add(day: string, kind: "credit" | "expense", amount: string) {
        const row = daily.get(day) ?? {credit: BigInt(0), expense: BigInt(0)};
        row[kind] += BigInt(amount); daily.set(day,row);
      }
      for (const row of credits.filter(row => row.currency === currency)) add(row.day,"credit",row.amount);
      for (const row of expenses.filter(row => row.currency === currency)) {
        add(row.day,"expense",row.amount);
        categories.set(row.category,(categories.get(row.category) ?? BigInt(0)) + BigInt(row.amount));
      }
      const days = [...daily.entries()].sort(([a],[b]) => b.localeCompare(a));
      const credit = days.reduce((sum,[,row]) => sum + row.credit,BigInt(0));
      const expense = days.reduce((sum,[,row]) => sum + row.expense,BigInt(0));
      const both = data.finance.available && data.expenses !== undefined;
      return <article className="panel space-y-5" key={currency}>
        <dl className="grid gap-4 sm:grid-cols-3">{[["Credits",data.finance.available ? money(credit,currency) : "Restricted"],["Expenses",data.expenses ? money(expense,currency) : "Restricted"],["Net movement",both ? money(credit-expense,currency) : "Restricted"]].map(([label,value])=><div key={label}><dt className="text-sm text-text-secondary">{label}</dt><dd className="text-xl font-semibold tabular-nums">{value}</dd></div>)}</dl>
        <div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Date</th><th>Credits</th><th>Expenses</th><th>Net</th></tr></thead>
        <tbody>{days.map(([day,row])=><tr key={day}><td className="whitespace-nowrap">{day}</td><td>{data.finance.available ? money(row.credit,currency) : "—"}</td><td>{data.expenses ? money(row.expense,currency) : "—"}</td><td>{both ? money(row.credit-row.expense,currency) : "—"}</td></tr>)}</tbody></table></div>
        {categories.size > 0 && <section><h3 className="font-semibold">Spending by category</h3><ul className="mt-3 space-y-3">{[...categories].sort((a,b)=>a[1]===b[1]?0:a[1]>b[1]?-1:1).map(([name,value])=><li key={name}><div className="flex justify-between gap-3 text-sm"><span>{name}</span><span>{money(value,currency)}</span></div>
        <div className="mt-1 h-2 rounded bg-surface-muted"><div className="h-full rounded bg-accent" style={{width:(expense ? Number(value * BigInt(1000) / expense)/10 : 0)+"%"}} /></div></li>)}</ul></section>}
      </article>;
    })}
    {data.finance.available && <article id="client-balances" className="panel"><h2 className="text-lg font-semibold">Client balances</h2><p className="mb-4 text-sm text-text-secondary">Current balances across all dates. Received includes advances. Outstanding includes issued invoices after allocated payments.</p>
    {data.finance.balances?.length ? <div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Client</th><th>Invoiced</th><th>Received</th><th>Outstanding</th></tr></thead><tbody>{data.finance.balances.map(row=><tr key={row.id+row.currency}><td><a className="underline" href={"/crm/clients/"+row.id}>{row.name}</a></td>{[row.billed,row.received,row.due].map((v,i)=><td key={i}>{formatMoney(v,row.currency)}</td>)}</tr>)}</tbody></table></div> : <p>No client payment or issued invoice yet.</p>}</article>}
  </section>;
}
