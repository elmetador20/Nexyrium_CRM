"use client";

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Briefcase, Building2, CheckCircle2, FileText, Loader2, Search, UserRound, X } from "lucide-react";

type DocumentItem = {
  id: string;
  title: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  contentUrl: string;
  createdAt: string;
};

export type RecordOption = { type: "lead" | "client" | "deal"; id: string; label: string; detail: string | null };

const TYPE_META = {
  client: { label: "Client", Icon: Building2 },
  deal: { label: "Deal", Icon: Briefcase },
  lead: { label: "Lead", Icon: UserRound },
} as const;

function RecordPicker({ options, value, onChange }: { options: RecordOption[]; value: RecordOption | null; onChange: (option: RecordOption | null) => void }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"all" | RecordOption["type"]>("all");
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return options.filter((o) => (type === "all" || o.type === type) && (!q || o.label.toLowerCase().includes(q) || (o.detail ?? "").toLowerCase().includes(q))).slice(0, 50);
  }, [options, query, type]);

  if (value) {
    const { Icon, label } = TYPE_META[value.type];
    return (
      <div className="flex items-center gap-3 rounded-lg border border-primary/40 bg-primary-light px-3 py-2">
        <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-text-primary">{value.label}</span><span className="block truncate text-xs text-text-muted">{label}{value.detail ? ` · ${value.detail}` : ""}</span></span>
        <button type="button" onClick={() => onChange(null)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-text-secondary hover:bg-surface" aria-label="Change linked record"><X className="h-3.5 w-3.5" aria-hidden />Change</button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap gap-1 border-b border-border p-1.5" role="group" aria-label="Record type">
        {(["all", "client", "deal", "lead"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setType(t)} aria-pressed={type === t} className={`rounded-md px-2.5 py-1 text-xs font-medium ${type === t ? "bg-primary text-white" : "text-text-secondary hover:bg-surface-hover"}`}>
            {t === "all" ? "All" : `${TYPE_META[t].label}s`}
          </button>
        ))}
      </div>
      <div className="relative border-b border-border">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or company" aria-label="Search records" className="w-full bg-transparent py-2.5 pl-9 pr-3 text-sm outline-none" />
      </div>
      <ul className="max-h-56 overflow-y-auto p-1" role="listbox" aria-label="Records">
        {matches.length === 0 ? <li className="px-3 py-4 text-center text-sm text-text-muted">{options.length === 0 ? "No leads, clients or deals you can access yet." : "No matching records."}</li> : matches.map((o) => {
          const { Icon, label } = TYPE_META[o.type];
          return (
            <li key={`${o.type}-${o.id}`}>
              <button type="button" role="option" aria-selected={false} onClick={() => onChange(o)} className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left hover:bg-surface-hover">
                <Icon className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm text-text-primary">{o.label}</span>{o.detail ? <span className="block truncate text-xs text-text-muted">{o.detail}</span> : null}</span>
                <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-text-muted">{label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function DocumentWorkspace({ initialDocuments, canUpload, uploadsReady, recordOptions }: { initialDocuments: DocumentItem[]; canUpload: boolean; uploadsReady: boolean; recordOptions: RecordOption[] }) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [record, setRecord] = useState<RecordOption | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function upload(formData: FormData) {
    setError(null);
    setSuccess(null);
    if (!record) return setError("Choose the lead, client or deal this document belongs to.");
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return setError("Choose a file to upload.");
    formData.set("recordType", record.type);
    formData.set("recordId", record.id);
    if (!String(formData.get("title") ?? "").trim()) formData.set("title", file.name.replace(/\.[^.]+$/, "") || file.name);
    setBusy(true);
    try {
      const response = await fetch("/api/v1/documents", { method: "POST", body: formData });
      const result = await response.json().catch(() => null);
      if (!response.ok) return setError(result?.error ?? "The document could not be uploaded.");
      setDocuments((current) => [result, ...current]);
      setSuccess(`“${result?.title ?? file.name}” was uploaded and linked to ${record.label}.`);
      formRef.current?.reset();
      setRecord(null);
    } catch {
      setError("Network error — the document was not uploaded. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {canUpload ? (
        <form ref={formRef} action={upload} className="rounded-[14px] border border-border bg-surface p-4 sm:p-5">
          <h3 className="font-semibold text-text-primary">Upload a private document</h3>
          <p className="mt-1 text-sm text-text-muted">Link it to a lead, client or deal. Access follows that record&apos;s permissions.</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <span className="block text-sm font-medium">Linked record <span className="text-danger">*</span></span>
              <RecordPicker options={recordOptions} value={record} onChange={setRecord} />
            </div>
            <label className="space-y-2 text-sm font-medium">File <span className="text-danger">*</span><input className="input" name="file" type="file" required disabled={busy} /></label>
            <label className="space-y-2 text-sm font-medium">Title<input className="input" name="title" placeholder="Defaults to the file name" maxLength={255} disabled={busy} /></label>
            <label className="space-y-2 text-sm font-medium">Category<input className="input" name="category" placeholder="Contract, brief, identity, etc." maxLength={100} disabled={busy} /></label>
          </div>
          <button className="button-primary mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-sm" type="submit" disabled={busy || !uploadsReady} title={uploadsReady ? undefined : "Google Drive setup is not complete"}>
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Uploading to Google Drive…</> : "Upload document"}
          </button>
          <div aria-live="polite">
            {error ? <p role="alert" className="mt-3 flex items-start gap-1.5 text-sm text-danger"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{error}</p> : null}
            {success ? <p role="status" className="mt-3 flex items-start gap-1.5 text-sm text-success"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{success}</p> : null}
          </div>
        </form>
      ) : null}
      <div className="overflow-hidden rounded-[14px] border border-border bg-surface">
        <div className="border-b border-border px-5 py-4"><h3 className="font-semibold text-text-primary">Documents</h3><p className="mt-1 text-sm text-text-muted">Only documents within your record and document scope are listed.</p></div>
        {documents.length === 0 ? (
          <p className="flex flex-col items-center gap-2 p-10 text-center text-sm text-text-muted"><FileText className="h-6 w-6" aria-hidden />No accessible documents yet.</p>
        ) : (
          <div className="nx-scroll-x">
            <table className="data-table">
              <thead><tr><th>Title</th><th>Type</th><th>Size</th><th>Status</th><th>Access</th></tr></thead>
              <tbody>{documents.map((document) => (
                <tr key={document.id}>
                  <td><p className="font-medium text-text-primary">{document.title}</p><p className="text-xs text-text-muted">{document.originalFilename}</p></td>
                  <td className="text-text-secondary">{document.mimeType === "application/pdf" ? "PDF" : document.mimeType.split("/").pop()?.toUpperCase()}</td>
                  <td className="text-text-secondary">{formatBytes(document.sizeBytes)}</td>
                  <td className="capitalize">{document.status}</td>
                  <td>{document.status === "available" ? <a className="nx-link" href={document.contentUrl}>Download</a> : "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
