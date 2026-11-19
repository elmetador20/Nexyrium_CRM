"use client";

import { useState } from "react";

type Event = {
  id: string;
  externalEventId: string;
  integrationKey: string;
  status: string;
  signatureStatus: string;
  errorCode: string | null;
  receivedAt: string;
};

export function MetaIntegrationStatus({ initial }: { initial: { configuration: Record<string, unknown>; events: { items: Event[]; total: number } } }) {
  const [state, setState] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    const response = await fetch("/api/v1/integrations/meta/events?page=1&pageSize=20");
    if (response.ok) setState(await response.json());
  }

  async function retry(eventId: string) {
    setMessage(null);
    const response = await fetch(`/api/v1/integrations/meta/events/${eventId}/retry`, { method: "POST" });
    const result = await response.json().catch(() => null);
    if (!response.ok) return setMessage(result?.error ?? "Retry failed.");
    setMessage("Retry completed.");
    await refresh();
  }

  const configuration = state.configuration;
  return <div className="space-y-6">
    <div className="grid gap-4 md:grid-cols-3">
      <StatusCard label="Webhook verification" value={configuration.webhookConfigured ? "Configured" : "Not configured"} good={Boolean(configuration.webhookConfigured)} />
      <StatusCard label="Lead retrieval" value={configuration.leadRetrievalConfigured ? "Configured" : "Not configured"} good={Boolean(configuration.leadRetrievalConfigured)} />
      <StatusCard label="Recent events" value={String(state.events.total)} good />
    </div>
    {!configuration.webhookConfigured || !configuration.leadRetrievalConfigured ? <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">Meta is not ready for live lead processing. Configure the server-side environment variables and Meta Business settings documented below before activating a webhook.</p> : null}
    {message ? <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">{message}</p> : null}
    <div className="rounded-xl border border-border bg-surface"><div className="flex items-center justify-between border-b border-border px-5 py-4"><div><h3 className="font-semibold">Webhook event history</h3><p className="mt-1 text-sm text-text-muted">Secrets and raw lead payloads are never shown here.</p></div><button className="button-secondary" type="button" onClick={refresh}>Refresh</button></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-border text-xs uppercase text-text-muted"><tr><th className="px-5 py-3">Received</th><th className="px-5 py-3">External event</th><th className="px-5 py-3">Signature</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Action</th></tr></thead><tbody>{state.events.items.map((event) => <tr key={event.id} className="border-b border-border"><td className="px-5 py-3">{new Date(event.receivedAt).toLocaleString()}</td><td className="px-5 py-3 font-mono text-xs">{event.externalEventId}</td><td className="px-5 py-3">{event.signatureStatus}</td><td className="px-5 py-3">{event.status}{event.errorCode ? <span className="ml-2 text-xs text-danger">{event.errorCode}</span> : null}</td><td className="px-5 py-3">{event.status === "failed" ? <button className="button-secondary" type="button" onClick={() => retry(event.id)}>Retry</button> : "—"}</td></tr>)}</tbody></table></div>{state.events.items.length === 0 ? <p className="p-8 text-center text-sm text-text-muted">No Meta webhook events have been received.</p> : null}</div>
  </div>;
}

function StatusCard({ label, value, good }: { label: string; value: string; good: boolean }) {
  return <div className="rounded-xl border border-border bg-surface p-4"><p className="text-xs uppercase tracking-wide text-text-muted">{label}</p><p className={`mt-2 font-semibold ${good ? "text-emerald-700" : "text-amber-700"}`}>{value}</p></div>;
}
