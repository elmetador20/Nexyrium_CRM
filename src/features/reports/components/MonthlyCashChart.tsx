"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useRouter } from "next/navigation";
import { currencyFractionDigits } from "@/features/finance/shared/money";

type Row = {day:string; currency:string; amount:string};
export function MonthlyCashChart({credits,expenses,from,to,departmentId}:{credits:Row[];expenses:Row[];from:string;to:string;departmentId?:string}) {
  const currencies=Array.from(new Set([...credits,...expenses].map(r=>r.currency))).sort();
  const [choice,setChoice]=useState("");
  const currency=currencies.includes(choice)?choice:currencies[0];
  const router=useRouter();
  if (!currency) return null;
  const months=new Map<string,{collected:bigint;spent:bigint}>();
  function sum(rows:Row[],key:"collected"|"spent") {
    for(const r of rows) {
      if(r.currency!==currency) continue;
      const month=r.day.slice(0,7), value=months.get(month) ?? {collected:BigInt(0),spent:BigInt(0)};
      value[key]+=BigInt(r.amount); months.set(month,value);
    }
  }
  sum(credits,"collected");sum(expenses,"spent");
  const unit=10**currencyFractionDigits(currency);
  const data=Array.from(months,([month,r])=>({month,collected:Number(r.collected)/unit,spent:Number(r.spent)/unit})).sort((a,b)=>a.month.localeCompare(b.month));
  function url(month:string,kind:"collected"|"spent") {
    const end=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);
    const p=new URLSearchParams({from:from>month+"-01"?from:month+"-01",to:to<end?to:end,currency});
    if(departmentId) p.set("departmentId",departmentId);
    if(kind==="collected") return "/finance/payments?status=posted&"+p;
    const report = new URLSearchParams({periodFrom:p.get("from")!,periodTo:p.get("to")!,currencyCodes:currency});
    if(departmentId) report.set("departmentIds",departmentId);
    return "/reports?"+report+"#daily-cashbook";
  }
  return <section className="panel"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Monthly collections and expenses</h2><label>Currency <select value={currency} onChange={e=>setChoice(e.target.value)}>{currencies.map(c=><option key={c}>{c}</option>)}</select></label></div>
    <div className="mt-5 h-56"><ResponsiveContainer width="100%" height="100%"><BarChart data={data}><CartesianGrid strokeDasharray="3 5" vertical={false}/><XAxis dataKey="month"/><YAxis width={66}/><Tooltip cursor={{fill:"#eaf0e9"}}/>
    <Bar dataKey="collected" name="Collected" fill="#436b52" cursor="pointer" onClick={(_,i)=>router.push(url(data[i].month,"collected"))}/><Bar dataKey="spent" name="Expenses" fill="#ca4121" cursor="pointer" onClick={(_,i)=>router.push(url(data[i].month,"spent"))}/></BarChart></ResponsiveContainer></div>
    <details className="mt-2"><summary className="cursor-pointer text-sm">Monthly figures and transactions</summary><ul>{data.map(r=><li key={r.month} className="flex flex-wrap gap-4 py-2"><span>{r.month}</span><a className="underline" href={url(r.month,"collected")}>Collected {r.collected.toLocaleString("en-IN")}</a><a className="underline" href={url(r.month,"spent")}>Expenses {r.spent.toLocaleString("en-IN")}</a></li>)}</ul></details></section>;
}
