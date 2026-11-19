"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function FinancialDetailActions({ kind, id, status }: { kind: "quotation" | "invoice"; id: string; status: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function post(action: string, input?: unknown) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(kind === "quotation" ? `/api/v1/quotations/${id}` : `/api/v1/invoices/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, input }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(result?.error ?? "Operation failed.");
        return;
      }
      setMessage("Updated successfully.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function pdf() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(kind === "quotation" ? `/api/v1/quotations/${id}/pdf` : `/api/v1/invoices/${id}/pdf`, { method: "POST" });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        setMessage(result?.error ?? "PDF generation failed.");
        return;
      }
      const body = await response.blob();
      const disposition = response.headers.get("content-disposition");
      const filenameMatch = disposition?.match(/filename\*=UTF-8''([^;]+)|filename="([^"]+)"/i);
      const filename = decodeURIComponent(filenameMatch?.[1] ?? filenameMatch?.[2] ?? `${kind}.pdf`);
      const url = URL.createObjectURL(body);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setMessage("PDF downloaded successfully.");
    } finally {
      setBusy(false);
    }
  }

  function voidInvoice() {
    if (window.confirm("Void this invoice? This cannot be undone.")) void post("void", { reason: "Administrative correction" });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {kind === "quotation" && status === "draft" ? <button className="button-secondary" type="button" disabled={busy} onClick={() => post("transition", { status: "submitted" })}>Submit</button> : null}
      {kind === "quotation" && status === "submitted" ? <button className="button-secondary" type="button" disabled={busy} onClick={() => post("transition", { status: "approved" })}>Approve</button> : null}
      {kind === "invoice" && status === "draft" ? <button className="button-secondary" type="button" disabled={busy} onClick={() => post("issue", { issue: true })}>Issue invoice</button> : null}
      {kind === "invoice" && status !== "voided" && status !== "paid" ? <button className="button-danger" type="button" disabled={busy} onClick={voidInvoice}>Void</button> : null}
      <button className="button-primary" type="button" disabled={busy} onClick={pdf}>{busy ? "Working…" : "Generate PDF"}</button>
      {message ? <span className="self-center text-sm text-text-secondary" role="status">{message}</span> : null}
    </div>
  );
}
