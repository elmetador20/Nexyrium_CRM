"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Copy, MessageCircle, Phone } from "lucide-react";
import { internationalPhone } from "./phone";

export function ContactActions({phone,country}: {phone:string|null; country?:string|null}) {
  const contact = internationalPhone(phone,country);
  const [notice,setNotice] = useState("");
  if (!contact) return <span className="text-xs text-text-muted">International number needed</span>;
  return <div className="flex flex-wrap items-center gap-2">
    <a className="button-secondary min-h-11" href={contact.call}><Phone size={16}/> Call</a>
    <a className="button-secondary min-h-11" href={contact.chat} target="_blank" rel="noopener noreferrer" title="Choose your WhatsApp account and send manually"><MessageCircle size={16}/> WhatsApp</a>
    <button className="button-ghost min-h-11" type="button" aria-label="Copy phone number" onClick={async()=>{
      try { await navigator.clipboard.writeText(contact.phone); setNotice("Number copied"); }
      catch { setNotice(contact.phone); }
    }}><Copy size={16}/></button><span role="status" className="select-all text-xs">{notice}</span>
  </div>;
}

export function FollowUpOutcome({id}:{id:string}) {
  const router=useRouter();
  const [busy,setBusy]=useState(false), [notice,setNotice]=useState("");
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form=event.currentTarget, data=new FormData(form);
    if (busy) return;
    setBusy(true);
    try {
      const response=await fetch("/api/v1/leads/"+id+"/activities",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:data.get("channel"),content:[data.get("outcome"),String(data.get("notes")??"").trim()].filter(Boolean).join(" — ")})});
      if (!response.ok) throw Error();
      form.reset(); setNotice("Follow-up recorded"); router.refresh();
    } catch { setNotice("Could not save the follow-up. Your notes are still here."); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="panel space-y-3"><h2 className="font-semibold">Record follow-up</h2>
    <label className="label">Contact method<select className="input" name="channel"><option value="call">Call</option><option value="whatsapp">Manual WhatsApp</option></select></label>
    <label className="label">Outcome<select required className="input" name="outcome" defaultValue=""><option disabled value="">Choose outcome</option>{["Attempted","No response","Contacted","Interested","Not interested","Follow-up required","Requested quotation"].map(v=><option key={v}>{v}</option>)}</select></label>
    <label className="label">Notes (optional)<textarea name="notes" maxLength={9000} className="input"/></label>
    <button className="button-primary" disabled={busy}>Save outcome</button><span role="status">{notice}</span>
  </form>;
}
