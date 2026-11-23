"use client";
import "@/features/reports/components/workspace.css";


import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { ACQUISITION_LABELS, ACQUISITION_SOURCES, getAcquisitionSource, splitSourceDetails } from "../acquisition-source";
import { LEAD_STATUSES } from "@/types/crm";

type LeadFormValues = {
  contactName?: string;
  email?: string | null;
  phone?: string | null;
  phoneCountryCode?: string | null;
  companyName?: string | null;
  source?: string;
  sourceDetails?: string | null;
  status?: (typeof LEAD_STATUSES)[number];
  ownerId?: string | null;
  departmentId?: string | null;
  notes?: string | null;
  nextAction?: string | null;
  nextActionAt?: string | null;
};

export function LeadFields({ endpoint, method, initial = {}, departments, salespeople }: { salespeople: {id:string;name:string}[]; departments: {id:string;name:string}[]; endpoint: string; method: "POST" | "PATCH"; initial?: LeadFormValues }) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const intakeEventId = useRef<string | null>(null);
  const router = useRouter();
  const attribution = initial.source ? getAcquisitionSource(initial.source, initial.sourceDetails) : undefined;

  async function submit(formData: FormData) {
    setSaving(true);
    setError(null);
    const payload = Object.fromEntries(formData.entries());
    if (method === "POST") {
      intakeEventId.current ??= crypto.randomUUID();
    }
    try {
    const response = await fetch(endpoint, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...payload,
        ownerId: payload.ownerId || undefined,
        departmentId: payload.departmentId || undefined,
        email: payload.email || null,
        phone: payload.phone || null,
        phoneCountryCode: payload.phoneCountryCode || null,
        companyName: payload.companyName || null,
        sourceDetails: payload.sourceDetails || null,
        notes: payload.notes || null,
        nextAction: payload.nextAction || null,
        nextActionAt: payload.nextActionAt || null,
        ...(method === "POST" ? { eventId: intakeEventId.current, entryMode:"crm_form" } : {}),
      }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      setError(result?.error ?? "The lead could not be saved.");
      setSaving(false);
      return;
    }
    if (result?.leadId || result?.id) {
      router.push(`/crm/leads/${result.leadId ?? result.id}`);
    } else {
      router.push("/crm/leads");
    }
    } catch { setError("Could not reach the server. Please try again."); setSaving(false); }
  }

  return (
    <form action={submit} className="lead-edit-mobile space-y-5 sm:space-y-6"><label className="block text-sm font-medium">Department<select className="input" name="departmentId" defaultValue={initial.departmentId ?? ""}><option value="">Use default department</option>{departments.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
      {salespeople.length > 0 && <label className="label">Assigned salesperson<select name="ownerId" className="input" defaultValue={salespeople.some(person=>person.id===initial.ownerId) ? initial.ownerId ?? "" : ""}><option value="">{method==="PATCH" ? "Keep current assignment" : "Default assignment"}</option>{salespeople.map(person=><option key={person.id} value={person.id}>{person.name}</option>)}</select></label>}
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Lead name" name="contactName" required defaultValue={initial.contactName} />
        <Field label="Company" name="companyName" required={method === "POST"} defaultValue={initial.companyName ?? ""} />
        <Field label="Email" name="email" type="email" defaultValue={initial.email ?? ""} />
        <Field type="tel" label="Phone" name="phone" required={method === "POST"} defaultValue={initial.phone ?? ""} />
        {method === "POST" ? <Field label="Phone country code (optional)" name="phoneCountryCode" placeholder="+1" defaultValue={initial.phoneCountryCode ?? ""} /> : null}
        {method === "POST" ? (
          <label className="space-y-2 text-sm font-medium">
            Ingestion
            <select name="source" defaultValue="manual" className="input">
              <option value="manual">Manual</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
          </label>
        ) : <p className="text-sm">Ingestion: {initial.source}</p>}
        <label className="space-y-2 text-sm font-medium">
          Source
          <select name="acquisitionSource" defaultValue={attribution ?? ""} className="input">
            <option value="" disabled={Boolean(attribution)}>Unclassified</option>
            {ACQUISITION_SOURCES.map((source) => (
              <option key={source} value={source}>{ACQUISITION_LABELS[source]}</option>
            ))}
          </select>
        </label>
        <label className="space-y-2 text-sm font-medium">
          Status
          <select name="status" defaultValue={initial.status ?? "new"} className="input">
            {LEAD_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </label>
        <Field label="Next action" name="nextAction" defaultValue={initial.nextAction ?? ""} />
        <Field label="Follow-up date" name="nextActionAt" type="datetime-local" defaultValue={initial.nextActionAt ?? ""} />
      </div>
      <Field label="Source details" name="sourceDetails" as="textarea" defaultValue={splitSourceDetails(initial.sourceDetails).details ?? ""} />
      <Field label="Notes" name="notes" as="textarea" defaultValue={initial.notes ?? ""} />
      {error ? <p className="rounded-lg bg-danger-light p-3 text-sm text-danger" role="alert">{error}</p> : null}
      <button disabled={saving} className="button-primary" type="submit">{saving ? "Saving…" : method === "POST" ? "Create lead" : "Save changes"}</button>
    </form>
  );
}

function Field({ label, name, type = "text", required, defaultValue, placeholder, as = "input" }: { label: string; name: string; type?: string; required?: boolean; defaultValue?: string; placeholder?: string; as?: "input" | "textarea" }) {
  return (
    <label className="space-y-2 text-sm font-medium">
      {label}{required ? <span className="text-danger" aria-hidden> *</span> : null}
      {as === "textarea" ? <textarea name={name} required={required} defaultValue={defaultValue} className="input min-h-28" /> : <input autoComplete={name === "phone" ? "tel" : name === "email" ? "email" : undefined} name={name} type={type} required={required} defaultValue={defaultValue} placeholder={placeholder} className="input" />}
    </label>
  );
}
