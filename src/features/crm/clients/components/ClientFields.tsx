"use client";
import "@/features/reports/components/workspace.css";


import { useState } from "react";
import { useRouter } from "next/navigation";

type ClientFormValues = {
  name?: string;
  companyName?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  ownerId?: string | null;
  departmentId?: string | null;
  notes?: string | null;
  contacts?: { name: string; email?: string | null; phone?: string | null; jobTitle?: string | null; isPrimary: boolean }[];
};

export function ClientFields({ endpoint, method, initial = {}, departments }: { departments: {id:string;name:string}[]; endpoint: string; method: "POST" | "PATCH"; initial?: ClientFormValues }) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const contact = initial.contacts?.find(item => item.isPrimary) ?? initial.contacts?.[0];

  async function submit(formData: FormData) {
    setSaving(true);
    setError(null);
    const values = Object.fromEntries(formData.entries());
    const contactName = String(values.contactName ?? "").trim();
    try {
    const response = await fetch(endpoint, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: values.name,
        departmentId: values.departmentId || undefined,
        companyName: values.companyName || null,
        email: values.email || "",
        phone: values.phone || "",
        website: values.website || "",
        notes: values.notes || null,
        contacts: [...(contactName ? [{ name: contactName, email: values.contactEmail || "", phone: values.contactPhone || "", jobTitle: values.contactTitle || "", isPrimary: true }] : []), ...(initial.contacts ?? []).filter(entry=>entry!==contact).map(entry=>({...entry,email:entry.email || "",phone:entry.phone || ""}))],
      }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      setError(result?.error ?? "The client could not be saved.");
      setSaving(false);
      return;
    }
    router.push(`/crm/clients/${result.id}`);
    } catch { setError("Could not reach the server. Please try again."); setSaving(false); }
  }

  return (
    <form action={submit} className="space-y-6"><label className="block text-sm font-medium">Department<select className="input" name="departmentId" defaultValue={initial.departmentId ?? ""}><option value="">Use default department</option>{departments.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Client name" name="name" required defaultValue={initial.name} />
        <Field label="Company" name="companyName" required={method === "POST"} defaultValue={initial.companyName ?? ""} />
        <Field label="Email" name="email" type="email" defaultValue={initial.email ?? ""} />
        <Field label="Phone" name="phone" type="tel" required={method === "POST"} defaultValue={initial.phone ?? ""} />
        <Field label="Website" name="website" type="url" defaultValue={initial.website ?? ""} />
      </div>
      <details open={Boolean(contact)} className="rounded-xl border border-border p-4">
        <summary className="cursor-pointer font-semibold">Primary contact (optional)</summary>
        <div className="mt-4 grid gap-5 md:grid-cols-2">
          <Field label="Contact name" name="contactName" defaultValue={contact?.name} />
          <Field label="Job title" name="contactTitle" defaultValue={contact?.jobTitle ?? ""} />
          <Field label="Contact email" name="contactEmail" type="email" defaultValue={contact?.email ?? ""} />
          <Field label="Contact phone" name="contactPhone" defaultValue={contact?.phone ?? ""} />
        </div>
      </details>
      <Field label="Notes" name="notes" as="textarea" defaultValue={initial.notes ?? ""} />
      {error ? <p className="rounded-lg bg-danger-light p-3 text-sm text-danger" role="alert">{error}</p> : null}
      <button disabled={saving} className="button-primary" type="submit">{saving ? "Saving…" : method === "POST" ? "Create client" : "Save changes"}</button>
    </form>
  );
}

function Field({ label, name, type = "text", required, defaultValue, as = "input" }: { label: string; name: string; type?: string; required?: boolean; defaultValue?: string; as?: "input" | "textarea" }) {
  return <label className="space-y-2 text-sm font-medium">{label}{required ? <span className="text-danger" aria-hidden> *</span> : null}{as === "textarea" ? <textarea name={name} required={required} defaultValue={defaultValue} className="input min-h-28" /> : <input name={name} type={type} required={required} defaultValue={defaultValue} className="input" />}</label>;
}
