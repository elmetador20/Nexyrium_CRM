"use client";

import { useEffect, useState } from "react";

type ClientOption = { id: string; name: string; companyName: string | null; email: string | null };

export function ClientSelector({ error, initial = null }: { error?: string; initial?: ClientOption | null }) {
  const [query, setQuery] = useState("");
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [selected, setSelected] = useState<ClientOption | null>(initial);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const params = new URLSearchParams({ page: "1", pageSize: "20" });
        if (query.trim()) params.set("search", query.trim());
        const response = await fetch(`/api/v1/invoices/clients?${params.toString()}`, { signal: controller.signal });
        const result = await response.json().catch(() => null);
        if (!response.ok) throw new Error(result?.error ?? "Clients could not be loaded.");
        setClients(result.items ?? []);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoadError(error instanceof Error ? error.message : "Clients could not be loaded.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return (
    <div className="space-y-2 md:col-span-2">
      <span className="block text-sm font-medium">Client</span>
       <input type="hidden" name="clientId" value={selected?.id ?? ""} required aria-required="true" />
      {selected ? (
        <div className="flex items-center justify-between rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-text-primary">
          <span>
            <strong>{selected.name}</strong>{selected.companyName ? ` · ${selected.companyName}` : ""}
          </span>
          <button type="button" className="text-sm underline" onClick={() => setSelected(null)}>Change</button>
        </div>
      ) : (
        <>
           <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by client or company" autoComplete="off" aria-label="Search clients" aria-controls="invoice-client-options" />
           <div id="invoice-client-options" className="rounded-lg border border-border bg-surface" role="listbox" aria-label="Clients">
             {loading ? <p className="px-3 py-2 text-sm text-text-muted">Searching…</p> : null}
             {!loading && clients.length === 0 ? <p className="px-3 py-2 text-sm text-text-muted">No authorized clients found.</p> : null}
            {clients.map((client) => (
               <button key={client.id} type="button" role="option" aria-selected={false} className="block w-full border-b border-border px-3 py-2 text-left text-sm text-text-primary last:border-0 hover:bg-surface-hover" onClick={() => { setSelected(client); setQuery(""); }}>
                <span className="font-medium">{client.name}</span>
                 {client.companyName ? <span className="text-text-muted"> · {client.companyName}</span> : null}
                 {client.email ? <span className="block text-xs text-text-muted">{client.email}</span> : null}
              </button>
            ))}
          </div>
        </>
      )}
       {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
       {loadError ? <p className="text-sm text-danger" role="alert">{loadError}</p> : null}
       <p className="text-xs text-text-muted">Already working with someone? Add them directly in CRM → Clients. You can invoice them without creating a lead or deal.</p>
    </div>
  );
}
