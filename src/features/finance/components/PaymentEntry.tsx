"use client";
import { SavedNotice } from "@/features/notifications/SavedNotice";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { formatMoney, majorToMinor } from "../shared/money";
import { ClientSelector } from "./ClientSelector";

export type PaymentFormProps = { invoiceId?: string; clientId?: string; currencyCode?: string; outstandingMinor?: string };

export function PaymentEntry({invoiceId, clientId, currencyCode = "INR", outstandingMinor, departments}: PaymentFormProps & {departments: Array<{id:string;name:string}>}) {
  const router = useRouter();
  const command = useRef({payload: "", key: ""});
  const [saved, setSaved] = useState<{id: string; client: string} | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const today = new Date().toLocaleDateString("en-CA", {timeZone: "Asia/Kolkata"});
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const element = event.currentTarget;
    const values = new FormData(element);
    setBusy(true); setMessage("");
    setMessage("");
    let payment = saved;
    try {
      if (!payment) {
        const client = clientId || String(values.get("clientId") || "");
        if (!client) throw Error("Select the client who paid.");
        const currency = String(values.get("currency") || currencyCode).toUpperCase();
        const amountMinor = majorToMinor(String(values.get("amount")), currency);
        if (BigInt(amountMinor) <= BigInt(0)) throw Error("Enter an amount above zero.");
        if (outstandingMinor && BigInt(amountMinor) > BigInt(outstandingMinor)) throw Error("Amount exceeds this invoice’s balance.");
        const payload = {status:"posted", clientId: client, currencyCode: currency, amountMinor,
          departmentId: values.get("departmentId") || undefined, paymentMethod: values.get("method"), receivedAt: String(values.get("date")) + "T00:00:00Z",
          externalReference: values.get("reference") || null, allocations: invoiceId ? [{invoiceId, amountMinor}] : []};
        const signature = JSON.stringify(payload);
        if (command.current.payload !== signature) command.current = {payload: signature, key: crypto.randomUUID()};
        const response = await fetch("/api/v1/payments", {method: "POST", headers: {"content-type":"application/json"},
          body: JSON.stringify({...payload, idempotencyKey: command.current.key})});
        const result = await response.json();
        if (!response.ok) throw Error(result.error || "Could not record payment.");
        payment = {id:result.id, client};
        setSaved(payment);
      }
      const file = values.get("file");
      if (file instanceof File && file.size) {
        const body = new FormData();
        body.set("recordType", "client"); body.set("recordId", payment.client);
        body.set("category", "payment_receipt"); body.set("title", "Payment " + payment.id); body.set("file", file);
        const response = await fetch("/api/v1/documents", {method: "POST", body});
        if (!response.ok) throw Error((await response.json()).error || "Could not upload screenshot.");
      }
      element.reset(); command.current = {payload:"", key:""}; setSaved(null);
      setMessage("Payment recorded."); router.refresh();
    } catch (err) {
      setMessage((payment ? "Payment already saved. " : "") + (err instanceof Error ? err.message : "Please check your connection."));
    } finally { setBusy(false); }
  }
  return <form className="card my-4 space-y-4 p-4" onSubmit={submit}>
    <h3 className="text-lg font-semibold">{invoiceId ? "Record invoice payment" : "Record client advance"}</h3>
    <p className="text-sm text-text-secondary">{outstandingMinor ? "Balance due · " + formatMoney(outstandingMinor, currencyCode) : "Use for money received before invoicing. For a payment against an issued invoice, open that invoice."}</p>
    <fieldset disabled={busy || Boolean(saved)} className="grid gap-3 sm:grid-cols-2">
      {!clientId && <ClientSelector />}
      <label>Amount<input className="input" name="amount" inputMode="decimal" required placeholder="0.00" /></label>
      <label>Payment status<input className="input" readOnly value="Received (posted)"/></label>
      <label>Date received<input className="input" name="date" type="date" defaultValue={today} required /></label>
      <label>Payment method<select className="input" name="method">{["Bank transfer","UPI","Cash","Card","Other"].map(m=><option value={m.toLowerCase().replace(" ","_")} key={m}>{m}</option>)}</select></label>
      {departments.length > 0 && <label>Department<select className="input" name="departmentId"><option value="">Use invoice or client department</option>{departments.map(d=><option value={d.id} key={d.id}>{d.name}</option>)}</select></label>}
      <label>Transaction reference<input name="reference" className="input" maxLength={255} /></label>
      {!invoiceId && <label>Currency<input name="currency" className="input" maxLength={3} required defaultValue={currencyCode} /></label>}
    </fieldset>
    <label className="block">Screenshot for the client’s documents (optional)<input type="file" className="input" name="file" disabled={busy} accept="image/png,image/jpeg,application/pdf" /></label>
    {message && (message === "Payment recorded." ? <SavedNotice message={message}/> : <p role="alert">{message}</p>)}
    <button className="button-primary" disabled={busy}>{busy ? "Saving…" : saved ? "Finish receipt upload" : "Save payment"}</button>
  </form>;
}
