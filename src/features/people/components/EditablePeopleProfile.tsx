"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function EditablePeopleProfile({ userId, initial, name, canRemove, teams, managers }: { name: string; teams:{id:string;name:string}[]; managers:{id:string;name:string}[]; canRemove: boolean; userId: string; initial: { jobTitle: string | null; employmentStatus: string; managerUserId: string | null; departmentIds: string[] } }) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  async function submit(formData: FormData) { if (formData.get("employmentStatus") === "terminated" && !window.confirm("Terminate this teammate and revoke workspace access?")) return; setSaving(true); setError(null); const departments = formData.getAll("departmentIds").map(String); const response = await fetch(`/api/v1/people/${userId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...(String(formData.get("name") ?? "").trim() ? { name: String(formData.get("name")).trim() } : {}), jobTitle: formData.get("jobTitle") || null, employmentStatus: formData.get("employmentStatus"), managerUserId: formData.get("managerUserId") || null, departmentIds: departments, primaryDepartmentId: departments[0] ?? null }) }); const result = await response.json().catch(() => null); setSaving(false); if (!response.ok) return setError(result?.error ?? "Profile could not be updated."); router.refresh(); }
  async function removeAccess() {
    if (!window.confirm("Remove this teammate from the active directory and block sign-in? Their work history will be kept.")) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/people/" + userId, { method: "PATCH", headers: {"content-type":"application/json"}, body: JSON.stringify({employmentStatus:"terminated"}) });
      if (!response.ok) throw new Error((await response.json()).error || "Could not remove user access.");
      router.push("/people");
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not remove user access."); }
    finally { setSaving(false); }
  }
  return <><form action={submit} className="mt-6 space-y-4"><label className="block text-sm font-medium">Display name<input className="input" name="name" defaultValue={name} maxLength={200} placeholder="Filled from their Google account on next sign-in" /></label><label className="block text-sm font-medium">Job title<input className="input" name="jobTitle" defaultValue={initial.jobTitle ?? ""} /></label><label className="block text-sm font-medium">Employment status<select className="input" name="employmentStatus" defaultValue={initial.employmentStatus}><option value="active">Active</option><option value="on_leave">On leave</option><option value="contractor">Contractor</option>{(canRemove || initial.employmentStatus === "terminated") && <option value="terminated">Terminated</option>}</select></label><label className="block text-sm font-medium">Manager<select className="input" name="managerUserId" defaultValue={initial.managerUserId ?? ""}><option value="">Unassigned</option>{managers.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label><label className="block text-sm font-medium">Departments<select className="input" multiple name="departmentIds" defaultValue={initial.departmentIds}>{teams.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>{error ? <p className="rounded-lg bg-danger-light p-3 text-sm text-danger">{error}</p> : null}<button className="button-primary" disabled={saving} type="submit">{saving ? "Saving…" : "Save profile"}</button></form>{canRemove && <button type="button" className="button-secondary mt-6 text-danger" disabled={saving} onClick={removeAccess}>Delete user access</button>}</>;
}
