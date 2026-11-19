"use client";
import { useActionState } from "react";
import { applyAdvance } from "@/features/payments/services/apply-advance";
import { formatMoney } from "../shared/money";

export function AdvanceAllocation({invoiceId,currency,options}:{invoiceId:string;currency:string;options:Array<{id:string,date:string,available:string}>}) {
  const [message,action,pending] = useActionState(applyAdvance,"");
  return <form action={action} className="panel space-y-3"><h3 className="font-semibold">Apply a previous advance</h3>
    <input type="hidden" name="invoice" value={invoiceId}/><label>Available client credit<select name="payment" className="input" required>{options.map(row=><option key={row.id} value={row.id}>{row.date} · {formatMoney(row.available,currency)}</option>)}</select></label>
    <p className="text-sm">Applies up to the invoice balance. This payment already counts toward cash received.</p>
    <button disabled={pending} className="button-secondary">{pending?"Applying…":"Apply advance"}</button><p role="status">{message}</p></form>;
}
