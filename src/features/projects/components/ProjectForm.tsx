"use client";
import "@/features/reports/components/workspace.css";


import { useState } from "react";
import { useRouter } from "next/navigation";

type ProjectFormValues = { name?: string; description?: string | null; status?: string; ownerId?: string | null; departmentId?: string | null; clientId?: string | null; dealId?: string | null; startDate?: string | null; dueDate?: string | null };

export function ProjectForm({ endpoint, method, initial = {} }: { endpoint: string; method: "POST" | "PATCH"; initial?: ProjectFormValues }) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  async function submit(formData: FormData) {
    setSaving(true); setError(null);
    const values = Object.fromEntries(formData.entries());
     const response = await fetch(endpoint, { method, headers: { "content-type": "application/json" }, body: JSON.stringify({ name: values.name, description: values.description || null, status: values.status, startDate: values.startDate || null, dueDate: values.dueDate || null }) });
    const result = await response.json().catch(() => null);
    setSaving(false);
    if (!response.ok) return setError(result?.error ?? "The project could not be saved.");
    router.push(`/projects/${result.id}`);
  }
  return <form action={submit} className="space-y-6"><div className="grid gap-5 md:grid-cols-2"><Field label="Project name" name="name" required defaultValue={initial.name} /><Field label="Start date" name="startDate" type="date" defaultValue={initial.startDate ?? ""} /><Field label="Due date" name="dueDate" type="date" defaultValue={initial.dueDate ?? ""} /><label className="space-y-2 text-sm font-medium">Status<select className="input" name="status" defaultValue={initial.status ?? "planned"}><option value="planned">Planned</option><option value="active">Active</option><option value="on_hold">On hold</option><option value="completed">Completed</option><option value="canceled">Canceled</option></select></label></div><Field label="Description" name="description" as="textarea" defaultValue={initial.description ?? ""} />{error ? <p className="rounded-lg bg-danger-light p-3 text-sm text-danger" role="alert">{error}</p> : null}<button className="button-primary" disabled={saving} type="submit">{saving ? "Saving…" : method === "POST" ? "Create project" : "Save changes"}</button></form>;
}

function Field({ label, name, type = "text", required, defaultValue, as = "input" }: { label: string; name: string; type?: string; required?: boolean; defaultValue?: string; as?: "input" | "textarea" }) { return <label className="space-y-2 text-sm font-medium">{label}{required ? <span className="text-danger" aria-hidden> *</span> : null}{as === "textarea" ? <textarea className="input min-h-28" name={name} required={required} defaultValue={defaultValue} /> : <input className="input" name={name} type={type} required={required} defaultValue={defaultValue} />}</label>; }
