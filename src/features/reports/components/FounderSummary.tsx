import Link from "next/link";
import { ArrowUpRight, Banknote, BriefcaseBusiness, CircleDollarSign, ClipboardList, Receipt, Users } from "lucide-react";
import type { DashboardMetrics } from "../types";
import { formatMoney } from "@/features/finance/shared/money";

type Amount = {currency:string; amount:string};
function money(rows: Amount[]) {
  const sums = new Map<string,bigint>();
  for (const row of rows) sums.set(row.currency,(sums.get(row.currency) ?? BigInt(0))+BigInt(row.amount));
  return [...sums].map(([currency,value])=>(value < 0 ? "-" : "")+formatMoney(value < 0 ? -value : value,currency)).join(" / ") || "0";
}

export function FounderSummary({data}: {data:DashboardMetrics}) {
  const finance = data.finance;
  const range = new URLSearchParams({from:data.filters.periodFrom,to:data.filters.periodTo});
  if (data.filters.departmentIds.length===1) range.set("departmentId",data.filters.departmentIds[0]);
  const cohort=data.leads.sourcePerformance ?? [];
  const converted=cohort.reduce((sum,r)=>sum+r.convertedCohort,0);
  const newLeads=data.leads.createdLeads ?? 0;
  const items = [
    ...(finance.available ? [
      {title:"Revenue collected",value:money((finance.paymentsReceived ?? []).map(r=>({currency:r.currency,amount:r.totalMinor}))),href:"/finance/payments?status=posted&"+range,Icon:Banknote},
      {title:"Overdue invoices ? amount due",value:money((finance.overdueReceivables ?? []).map(r=>({currency:r.currency,amount:r.outstandingMinor}))),href:"#overdue-invoices",Icon:Receipt},
      {title:"Pending invoice payments",value:finance.unpaidCount ?? 0,href:"#overdue-invoices",Icon:Receipt},
      {title:"Outstanding receivables",value:money((finance.receivables ?? []).map(r=>({currency:r.currency,amount:r.outstandingMinor}))),href:"#client-balances",Icon:CircleDollarSign}
    ] : []),
    ...(data.expenses ? [{title:"Recorded expenses",value:money(data.expenses),href:"/expenses?includedOnly=1&"+range,Icon:Receipt}] : []),
    ...(data.profit ? [{title:"Net profit · posted ledger",value:data.profit.length ? money(data.profit) : "No postings",href:"#ledger-summary",Icon:Banknote}] : []),
    ...(data.deals.available ? [{title:"Lost deals",value:data.deals.lostCount ?? 0,href:"/crm/deals?stage=lost",Icon:BriefcaseBusiness},{title:"Open pipeline",value:[...new Set(data.deals.pipelineByStage?.map(row=>row.currency))].map(currency=>currency+" "+data.deals.pipelineByStage!.filter(row=>row.currency===currency).reduce((sum,row)=>sum+Number(row.total),0).toLocaleString("en-IN",{maximumFractionDigits:2})).join(" / ") || "0",href:"#open-pipeline",Icon:BriefcaseBusiness},{title:"Deals won",value:data.deals.wonCount ?? 0,href:"/crm/deals?stage=won",Icon:BriefcaseBusiness}] : []),
    ...(data.leads.available ? [{title:"Total leads",value:Object.values(data.leads.funnel ?? {}).reduce((sum,n)=>sum+n,0),href:"/crm/leads",Icon:Users},{title:"New lead conversion",value:newLeads ? (100*converted/newLeads).toFixed(1)+"%" : "No new leads",href:"#lead-conversion",Icon:Users},{title:"New leads",value:data.leads.createdLeads ?? 0,href:"/crm/leads",Icon:Users}] : []),
    ...(data.allClientCount !== undefined ? [{title:"Clients including archived",value:data.allClientCount,href:"/crm/clients",Icon:Users}] : []),
    ...(data.clientCount !== undefined ? [{title:"Active clients",value:data.clientCount,href:"/crm/clients",Icon:Users}] : []),
    ...(data.delivery.available ? [{title:"Overdue tasks",value:data.delivery.overdueTasks ?? 0,href:"/tasks",Icon:ClipboardList}] : [])
  ];
  return <section aria-label="Business metrics" className="grid grid-cols-2 gap-3 lg:grid-cols-4">{items.map(({title,value,href,Icon})=><Link key={title} href={href} className="group rounded-2xl border border-border bg-surface p-4 shadow-sm transition hover:border-primary focus-visible:outline-primary motion-safe:hover:-translate-y-0.5">
    <div className="flex items-center justify-between text-primary"><Icon size={18}/><ArrowUpRight size={14}/></div>
    <h2 className="mt-4 text-sm text-text-secondary">{title}</h2><p className="mt-1 break-words text-xl font-semibold tabular-nums">{value}</p>
  </Link>)}</section>;
}
