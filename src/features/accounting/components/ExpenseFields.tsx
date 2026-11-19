"use client";
import "@/features/reports/components/workspace.css";


import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { majorToMinor } from "@/features/finance/shared/money";

export function ExpenseFields({departments}:{departments:{id:string;name:string}[]}) {
  const entryId = useRef("");
  const router = useRouter();
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const today = new Date().toLocaleDateString("en-CA", {timeZone: "Asia/Kolkata"});

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    let id = saved;
    try {
      if (!id) {
        const currencyCode = String(form.get("currencyCode") || "INR").trim().toUpperCase();
        const amountMinor = majorToMinor(String(form.get("amount")), currencyCode);
        entryId.current ||= crypto.randomUUID();
        const response = await fetch("/api/v1/expenses", {
          method: "POST", headers: {"content-type": "application/json"},
          body: JSON.stringify({entryId: entryId.current, amountMinor, currencyCode, departmentId: form.get('departmentId') || undefined, category: String(form.get("category") || "").trim() || "Other",
            merchantName: form.get("merchantName") || null, description: form.get("description"), incurredOn: form.get("incurredOn")}),
        });
        const result = await response.json();
        if (!response.ok) throw Error(result.error || "Could not save this expense.");
        id = result.id;
        setSaved(id);
      }
      const file = form.get("file");
      if (file instanceof File && file.size) {
        const attachment = new FormData();
        attachment.set("file", file);
        entryId.current ||= crypto.randomUUID();
        const response = await fetch(`/api/v1/expenses/${id}/receipts`, {method: "POST", body: attachment});
        if (!response.ok) throw Error((await response.json()).error || "Could not upload receipt.");
      }
      router.push(`/expenses/${id}`);
      router.refresh();
    } catch (err) {
      setError((id ? "Expense saved. " : "") + (err instanceof Error ? err.message : "Please check your connection."));
    } finally { setBusy(false); }
  }

  return <form onSubmit={submit} className="space-y-5">
    <fieldset disabled={busy || Boolean(saved)} className="grid gap-4 sm:grid-cols-2">
      <label>Amount<span className="text-danger" aria-hidden> *</span><input className="input text-lg" name="amount" placeholder="0.00" inputMode="decimal" required /></label>
      <label>Expense date<span className="text-danger" aria-hidden> *</span><input className="input" type="date" name="incurredOn" defaultValue={today} required /></label>
      <label>Paid to<input className="input" name="merchantName" placeholder="Vendor or team member" /></label>
      <label>Category<input list="expense-categories" className="input" name="category" placeholder="Other" />
        <datalist id="expense-categories">{["Developer payout","Designer payout","Advertising","Software","Travel","Office","Other"].map(item => <option key={item}>{item}</option>)}</datalist></label>
      <label className="sm:col-span-2">Expense title<span className="text-danger" aria-hidden> *</span><input className="input" name="description" placeholder="e.g. Shopify redesign milestone" required /></label>
      <label>Department<select name="departmentId" className="input"><option value="">Use default department</option>{departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
      <label>Currency<input className="input" name="currencyCode" defaultValue="INR" maxLength={3} /></label>
    </fieldset>
    <label className="block">Receipt or screenshot (optional)<input className="input" type="file" name="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={busy} /></label>
    {error && <p role="alert">{error}</p>}
    <div className="flex flex-wrap gap-3"><button className="button-primary" disabled={busy}>{busy ? "Saving…" : saved ? "Finish receipt upload" : "Save expense"}</button>
      {saved && <Link className="button-secondary" href={`/expenses/${saved}`}>Open saved expense</Link>}</div>
  </form>;
}
