"use client";

import { SavedNotice } from "@/features/notifications/SavedNotice";
import { useState, useRef } from "react";

export function TaskForm({ projectId, onCreated }: { projectId: string; onCreated?: () => void }) {
  const formRef=useRef<HTMLFormElement>(null);
  const [saved,setSaved]=useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function submit(formData: FormData) {
    if(saving) return;
    setSaved(false); setSaving(true); setError(null);
    const values = Object.fromEntries(formData.entries());
    try {
    const response = await fetch(`/api/v1/projects/${projectId}/tasks`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: values.title, description: values.description || null, priority: values.priority, assigneeId: values.assigneeId || null, dueDate: values.dueDate || null }) });
    const result = await response.json().catch(() => null);
    setSaving(false);
    if (!response.ok) return setError(result?.error ?? "The task could not be created.");
    formRef.current?.reset();
    setSaved(true);
    onCreated?.();
    } catch { setError("Could not reach the server. Your task was not confirmed."); } finally {setSaving(false);}
  }
  return <form ref={formRef} action={submit} className="card p-5">{saved && <SavedNotice message="Task created."/>}<h3 className="font-semibold text-text-primary">Add task</h3><div className="mt-4 grid gap-4 md:grid-cols-2"><label className="space-y-2 text-sm font-medium text-text-primary md:col-span-2">Title<span className="text-danger" aria-hidden> *</span><input className="input" name="title" required /></label><label className="space-y-2 text-sm font-medium text-text-primary md:col-span-2">Description<textarea className="input min-h-20" name="description" /></label><label className="space-y-2 text-sm font-medium text-text-primary">Priority<select className="input" name="priority" defaultValue="medium"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></label><label className="space-y-2 text-sm font-medium text-text-primary">Due date<input className="input" name="dueDate" type="date" /></label></div>{error ? <p className="mt-3 rounded-lg bg-danger-light p-3 text-sm text-danger" role="alert">{error}</p> : null}<button className="button-primary mt-4" disabled={saving} type="submit">{saving ? "Adding…" : "Add task"}</button></form>;
}
