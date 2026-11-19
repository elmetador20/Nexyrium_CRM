"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Expense workflow transitions. Receipt uploads live in ReceiptUploader. */
export function ExpenseActions({ id, status }: { id: string; status: string }) {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function transition(action: string) {
    setBusy(true);
    setMessage(null);
    const response = await fetch(`/api/v1/expenses/${id}/transition`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, input: action === "submit" ? undefined : { reason } }) });
    const result = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) return setMessage({ ok: false, text: result?.error ?? "Expense transition failed." });
    setMessage({ ok: true, text: "Expense updated." });
    router.refresh();
  }
  if (status !== "draft" && status !== "submitted") return null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {status === "draft" ? <button className="button-secondary px-3 py-2 text-sm" type="button" disabled={busy} onClick={() => transition("submit")}>Submit for approval</button> : null}
        {status === "submitted" ? (
          <>
            <button className="button-secondary px-3 py-2 text-sm" type="button" disabled={busy} onClick={() => transition("approve")}>Approve</button>
            <button className="button-secondary px-3 py-2 text-sm" type="button" disabled={busy} onClick={() => transition("reject")}>Reject</button>
            <input className="input mt-0 w-full" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Approval/rejection reason" aria-label="Approval or rejection reason" />
          </>
        ) : null}
      </div>
      {message ? <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-success" : "text-danger"}`}>{message.text}</p> : null}
    </div>
  );
}
