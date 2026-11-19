"use client";
import "@/features/reports/components/workspace.css";


import { useState } from "react";
import { useRouter } from "next/navigation";

import { DEAL_STAGES } from "@/types/crm";

type DealFormValues = {
  title?: string;
  stage?: (typeof DEAL_STAGES)[number];
  expectedValue?: string | number;
  currency?: string;
  expectedCloseDate?: string | null;
  ownerId?: string | null;
  departmentId?: string | null;
  clientId?: string | null;
  leadId?: string | null;
  notes?: string | null;
};

export function DealFields({ endpoint, method, initial = {}, departments }: { departments: {id:string;name:string}[]; endpoint: string; method: "POST" | "PATCH"; initial?: DealFormValues }) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function submit(formData: FormData) {
    setSaving(true);
    setError(null);
    const values = Object.fromEntries(formData.entries());
    try {
    const response = await fetch(endpoint, {
      method,
      headers: { "content-type": "application/json" },
       body: JSON.stringify({ ...values, departmentId: values.departmentId || undefined, expectedValue: Number(values.expectedValue), expectedCloseDate: values.expectedCloseDate || null, notes: values.notes || null }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      setError(result?.error ?? "The deal could not be saved.");
      setSaving(false);
      return;
    }
    router.push(`/crm/deals/${result.id}`);
    } catch { setError("Could not reach the server. Please try again."); setSaving(false); }
  }

  return (
    <form action={submit} className="space-y-6"><label className="block text-sm font-medium">Department<select className="input" name="departmentId" defaultValue={initial.departmentId ?? ""}><option value="">Use default department</option>{departments.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Deal title" name="title" required defaultValue={initial.title} />
        <label className="space-y-2 text-sm font-medium">Stage<select name="stage" defaultValue={initial.stage ?? "prospecting"} className="input">{DEAL_STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}</select></label>
        <Field label="Expected value" name="expectedValue" type="number" required defaultValue={String(initial.expectedValue ?? "0")} />
        <Field label="Currency" name="currency" required defaultValue={initial.currency ?? "INR"} />
        <Field label="Expected close date" name="expectedCloseDate" type="date" defaultValue={initial.expectedCloseDate ?? ""} />
      </div>
      <Field label="Notes" name="notes" as="textarea" defaultValue={initial.notes ?? ""} />
      {error ? <p className="rounded-lg bg-danger-light p-3 text-sm text-danger" role="alert">{error}</p> : null}
      <button disabled={saving} className="button-primary" type="submit">{saving ? "Saving…" : method === "POST" ? "Create deal" : "Save changes"}</button>
    </form>
  );
}

function Field({ label, name, type = "text", required, defaultValue, as = "input" }: { label: string; name: string; type?: string; required?: boolean; defaultValue?: string; as?: "input" | "textarea" }) {
  return <label className="space-y-2 text-sm font-medium">{label}{required ? <span className="text-danger" aria-hidden> *</span> : null}{as === "textarea" ? <textarea name={name} required={required} defaultValue={defaultValue} className="input min-h-28" /> : <input name={name} type={type} required={required} defaultValue={defaultValue} className="input" />}</label>;
}
