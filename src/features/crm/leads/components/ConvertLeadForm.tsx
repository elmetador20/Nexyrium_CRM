"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRightLeft } from "lucide-react";

type LeadSnapshot = { id: string; contactName: string; companyName: string | null; email: string | null; phone: string | null };

/** Convert a lead into a client and an opening deal (POST /api/v1/leads/:id/convert). */
export function ConvertLeadForm({ lead }: { lead: LeadSnapshot }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(form: FormData) {
    setSaving(true);
    setError(null);
    const value = (key: string) => String(form.get(key) ?? "").trim();
    const response = await fetch(`/api/v1/leads/${lead.id}/convert`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client: { name: value("name"), companyName: value("companyName"), phone: value("phone"), email: value("email") },
        deal: { title: value("dealTitle"), expectedValue: value("expectedValue") || "0", currency: value("currency") || "INR", expectedCloseDate: value("expectedCloseDate") || null },
      }),
    }).catch(() => null);
    const result = await response?.json().catch(() => null);
    if (!response?.ok) {
      setError(result?.error ?? "The lead could not be converted.");
      setSaving(false);
      return;
    }
    const clientId = result?.client?.id ?? result?.clientId;
    router.push(clientId ? `/crm/clients/${clientId}` : "/crm/clients");
    router.refresh();
  }

  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className="button-primary inline-flex items-center gap-1.5 px-3 py-2 text-sm"><ArrowRightLeft className="h-4 w-4" aria-hidden />Convert to client</button>;
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#18231F]/40 p-4" role="dialog" aria-modal="true" aria-labelledby="convert-title">
      <form action={submit} className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-xl nx-fade-up">
        <h2 id="convert-title" className="text-lg font-semibold text-text-primary">Convert {lead.contactName}</h2>
        <p className="mt-1 text-sm text-text-secondary">Creates a client and an opening deal, and links them to this lead.</p>
        <fieldset className="mt-5 grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Client</legend>
          <label className="text-sm font-medium">Client name<span className="text-danger"> *</span><input className="input" name="name" required defaultValue={lead.contactName} /></label>
          <label className="text-sm font-medium">Company<span className="text-danger"> *</span><input className="input" name="companyName" required defaultValue={lead.companyName ?? ""} /></label>
          <label className="text-sm font-medium">Phone<span className="text-danger"> *</span><input className="input" name="phone" type="tel" required defaultValue={lead.phone ?? ""} /></label>
          <label className="text-sm font-medium">Email<input className="input" name="email" type="email" defaultValue={lead.email ?? ""} /></label>
        </fieldset>
        <fieldset className="mt-5 grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Opening deal</legend>
          <label className="text-sm font-medium sm:col-span-2">Deal name<span className="text-danger"> *</span><input className="input" name="dealTitle" required defaultValue={`${lead.companyName ?? lead.contactName} engagement`} /></label>
          <label className="text-sm font-medium">Deal value<span className="text-danger"> *</span><input className="input" name="expectedValue" type="number" min="0" step="0.01" required defaultValue="0" /></label>
          <label className="text-sm font-medium">Currency<input className="input" name="currency" maxLength={3} defaultValue="INR" /></label>
          <label className="text-sm font-medium">Expected close<input className="input" name="expectedCloseDate" type="date" /></label>
        </fieldset>
        {error ? <p role="alert" className="mt-4 rounded-lg bg-danger-light p-3 text-sm text-danger">{error}</p> : null}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="button-secondary px-4 py-2 text-sm" onClick={() => setOpen(false)} disabled={saving}>Cancel</button>
          <button className="button-primary px-4 py-2 text-sm" disabled={saving}>{saving ? "Converting…" : "Convert"}</button>
        </div>
      </form>
    </div>
  );
}
