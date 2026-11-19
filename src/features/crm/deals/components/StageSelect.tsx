"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DEAL_STAGES } from "@/types/crm";

/** Move a deal to another stage from the pipeline board. */
export function StageSelect({ dealId, stage, disabled }: { dealId: string; stage: string; disabled?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <label className="sr-only" htmlFor={`stage-${dealId}`}>Stage</label>
      <select
        id={`stage-${dealId}`}
        className="h-7 w-full rounded-md border border-border bg-surface px-1.5 text-xs text-text-secondary disabled:opacity-60"
        defaultValue={stage}
        disabled={disabled || pending}
        onChange={async (event) => {
          const select = event.currentTarget;
          setError(null);
          const response = await fetch(`/api/v1/deals/${dealId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ stage: select.value }) }).catch(() => null);
          if (!response?.ok) { setError("Could not move the deal."); select.value = stage; return; }
          startTransition(() => router.refresh());
        }}
      >
        {DEAL_STAGES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
      </select>
      {error ? <p role="alert" className="mt-1 text-[0.7rem] text-danger">{error}</p> : null}
    </div>
  );
}
