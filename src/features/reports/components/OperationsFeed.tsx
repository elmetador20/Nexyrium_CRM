import Link from "next/link";
import { formatMoney } from "@/features/finance/shared/money";
import type { DashboardMetrics } from "../types";

type Row = {key:string; title:string; value:string; href:string};
function Feed({title,rows}:{title:string;rows:Row[]|undefined}) {
  if (!rows) return null;
  return <section className="panel"><h2 className="mb-3 text-lg font-semibold">{title}</h2>
    {rows.length ? <ul className="divide-y divide-border">{rows.map(r=><li key={r.key}><Link href={r.href} className="flex flex-wrap justify-between gap-x-3 gap-y-1 py-3 text-sm"><span className="font-medium">{r.title}</span><span className="text-text-secondary">{r.value}</span></Link></li>)}</ul> : <p className="text-sm text-text-secondary">No matching records.</p>}</section>;
}

export function OperationsFeed({data}:{data:DashboardMetrics}) {
  const o=data.operations;
  if (!o) return null;
  const groups = new Map<string,Row[]>();
  for(const c of o.topClients ?? []) {
    const group=groups.get(c.currency) ?? [];
    if(group.length<5) group.push({key:c.id,title:c.name,value:formatMoney(c.amount,c.currency),href:"/crm/clients/"+c.id});
    groups.set(c.currency,group);
  }
  return <div className="grid gap-4 lg:grid-cols-2">
    {data.finance.available && <div id="overdue-invoices"><Feed title="Unpaid invoices by due date" rows={data.finance.openInvoices?.map(i=>({key:i.id,title:i.title,value:formatMoney(i.amount,i.currency)+" ? "+(i.due || "No due date"),href:"/finance/invoices/"+i.id}))}/></div>}
    <Feed title="Upcoming follow-ups" rows={o.followups?.map(r=>({key:r.id,title:r.name,value:[r.due?.toISOString().slice(0,10),r.detail].filter(Boolean).join(" · "),href:"/crm/leads/"+r.id}))}/>
    <Feed title="Latest deals" rows={o.latestDeals?.map(r=>({key:r.id,title:r.name,value:r.stage.replaceAll("_"," "),href:"/crm/deals/"+r.id}))}/>
    <Feed title="Recent payments" rows={o.recentPayments?.map(r=>({key:r.id,title:r.name,value:formatMoney(r.amount,r.currency),href:"/finance/payments?q="+encodeURIComponent(r.name)}))}/>
    <Feed title="Recent expenses" rows={o.recentExpenses?.map(r=>({key:r.id,title:r.name,value:formatMoney(r.amount,r.currency),href:"/expenses/"+r.id}))}/>
    {Array.from(groups,([currency,rows])=><Feed key={currency} title={"Top clients by collections · "+currency} rows={rows}/>)}
  </div>;
}
