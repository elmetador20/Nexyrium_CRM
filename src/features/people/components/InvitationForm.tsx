"use client";
import { useState, type FormEvent } from "react";

type Option = { id: string; name: string };
export function InvitationForm({roles, departments}: {roles: Option[]; departments: Option[]}) {
  const [link, setLink] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true); setMessage(""); setLink("");
    try {
      const response = await fetch("/api/v1/auth/invitations", {method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({
        email:data.get("email"), roleId:data.get("role"), departmentId:data.get("department") || undefined
      })});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not create invitation.");
      setLink(result.invitationUrl);
      setMessage("Invitation ready for " + result.email + ". Share the link privately within seven days.");
      form.reset();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not create invitation."); }
    finally { setBusy(false); }
  }
  return <div className="mt-4 space-y-3"><form onSubmit={invite} className="grid gap-3 sm:grid-cols-2">
    <label>Google work email<input name="email" type="email" required className="input"/></label>
    <label>Workspace role<select name="role" required defaultValue="" className="input"><option value="" disabled>Choose role</option>{roles.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
    <label>Department<select name="department" className="input"><option value="">No department</option>{departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
    <div className="self-end"><button className="button-primary" disabled={busy}>{busy ? "Creating invitation..." : "Create invite link"}</button></div></form>
    <p role="status">{message}</p>{link && <div><label>Invitation link<input readOnly className="input" value={link} onFocus={event=>event.currentTarget.select()}/></label><button className="button-secondary mt-2" onClick={async()=>{try {await navigator.clipboard.writeText(link); setMessage("Invitation link copied.");} catch {setMessage("Select the invitation link and copy it manually.");}}}>Copy link</button></div>}
  </div>;
}
