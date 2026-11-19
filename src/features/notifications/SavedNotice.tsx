"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, X } from "lucide-react";

/** A transient confirmation toast. A new `message` shows the toast again. */
export function SavedNotice({message}:{message:string}) {
  const [dismissed,setDismissed]=useState<string|null>(null);
  useEffect(()=>{
    const timer=window.setTimeout(()=>setDismissed(message),6000);
    return ()=>window.clearTimeout(timer);
  },[message]);
  if(dismissed===message) return null;
  return <div role="status" className="fixed inset-x-3 bottom-4 z-50 mx-auto flex max-w-sm items-center gap-3 rounded-xl border border-border bg-surface p-4 text-sm shadow-lg animate-in">
    <CheckCircle2 aria-hidden size={18} className="text-primary"/><span className="flex-1">{message}</span><button type="button" aria-label="Dismiss notification" onClick={()=>setDismissed(message)}><X size={16}/></button>
  </div>;
}
