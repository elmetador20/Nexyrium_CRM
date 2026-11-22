"use client";
import Link from "next/link";
import {useState} from "react";
import {readInbox,markRead} from "./inbox";
import {Devices} from "./PhoneSettings";
export function Inbox({initial}:{initial:Awaited<ReturnType<typeof readInbox>>}){
  const [data,setData]=useState(initial),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  async function update(action:"read"|"more"|"refresh",id?:string){
    setBusy(true);setError("");
    try{
      if(action==="read")await markRead(id);
      const last=data.items.at(-1);
      const result=await readInbox(action==="more" && last ? {date:last.date,id:last.id}:undefined);
      setData(action==="more"?{...result,items:[...data.items,...result.items]}:result);
      window.dispatchEvent(new Event("inbox-changed"));
    }catch{setError("Could not update the inbox. Try again.");}finally{setBusy(false);}
  }
  return <section className="mx-auto max-w-3xl space-y-5"><div className="flex items-center justify-between"><h1 className="text-2xl font-semibold">Notifications</h1><span className="badge badge-primary tabular-nums">{data.unread} unread</span></div>
    <div className="flex flex-wrap gap-3"><button className="button-secondary" disabled={busy} onClick={()=>update("refresh")}>Refresh</button><button className="button-secondary" disabled={busy || !data.unread} onClick={()=>update("read")}>Mark all as read</button></div>
    <ul className="card divide-y divide-border overflow-hidden">{data.items.map(item=><li key={item.id} className={item.read ? "p-4" : "border-s-2 border-s-primary bg-primary-light/25 p-4"}><div className="flex justify-between gap-3"><strong>{item.title}</strong><time className="text-xs" dateTime={item.date}>{new Date(item.date).toLocaleDateString("en-IN",{timeZone:"Asia/Kolkata"})}</time></div><p className="my-2 text-sm leading-relaxed text-text-secondary">{item.body}</p>
    {item.href && <Link className="nx-link mr-4" href={item.href} onClick={()=>{void markRead(item.id).then(()=>window.dispatchEvent(new Event("inbox-changed"))).catch(()=>{});}}>Open record</Link>}
    {!item.read && <button disabled={busy} className="nx-link" onClick={()=>update("read",item.id)}>Mark as read</button>}</li>)}</ul>
    {!data.items.length && <p>Your inbox is empty.</p>}{data.more && <button className="button-secondary" disabled={busy} onClick={()=>update("more")}>Load older notifications</button>}
    {error && <p role="alert">{error}</p>}<Devices/></section>;
}
