"use client";
import { SavedNotice } from "@/features/notifications/SavedNotice";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { majorToMinor } from "@/features/finance/shared/money";

export function MonthlyTargetForm({departments}: {departments: Array<{id:string; name:string}>}) {
  const router = useRouter();
  const [metric,setMetric] = useState("payments_received_minor");
  const [message,setMessage] = useState("");
  const [busy,setBusy] = useState(false);
  const monetary = metric.endsWith("_minor");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setMessage("");
    try {
      const month = String(form.get("month"));
      const last = new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).toISOString().slice(0,10);
      const currency = String(form.get("currency") || "INR").toUpperCase();
      const amount = String(form.get("amount"));
      const payload = { departmentId:form.get("department"), metricKey:metric, periodStart:month+"-01", periodEnd:last,
        ...(monetary ? {unit:"minor_amount",targetMinor:majorToMinor(amount,currency),currencyCode:currency} : {unit:"count",targetCount:Number(amount)}) };
      const response = await fetch("/api/v1/targets",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
      if (!response.ok) throw Error((await response.json()).error || "Could not save target.");
      setMessage("Monthly target saved."); router.refresh();
    } catch(err) { setMessage(err instanceof Error ? err.message : "Could not save target."); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
    <label>Department<select name="department" className="input">{departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
    <label>Month<input name="month" className="input" type="month" required defaultValue={new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Kolkata"}).slice(0,7)} /></label>
    <label>Measure<select className="input" value={metric} onChange={e=>setMetric(e.target.value)}><option value="payments_received_minor">Payments received</option><option value="invoices_issued_minor">Invoices issued</option><option value="leads_created">Leads created</option><option value="tasks_completed">Tasks completed</option></select></label>
    <label>{monetary ? "Target amount" : "Target count"}<input className="input" name="amount" required type="number" min="0" step={monetary?"any":"1"} /></label>
    {monetary && <label>Currency<input name="currency" className="input" required defaultValue="INR" maxLength={3} /></label>}
    <div className="sm:col-span-2"><button disabled={busy} className="button-primary">{busy?"Saving…":"Save monthly target"}</button>{message && (message === "Monthly target saved." ? <SavedNotice message={message}/> : <p role="alert">{message}</p>)}</div>
  </form>;
}
