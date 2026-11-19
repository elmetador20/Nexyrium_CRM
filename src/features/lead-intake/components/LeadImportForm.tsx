"use client";

import { useState } from "react";
import Link from "next/link";

type Preview = {
  headers: string[];
  worksheetName: string | null;
  suggestedMapping: Record<string, string>;
  sampleRows: Array<{ rowNumber: number; values: Record<string, string> }>;
  totalRows: number;
};

type Job = {
  id: string;
  status: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  createdCount: number;
  linkedCount: number;
  needsReviewCount: number;
  failedCount: number;
};

type Row = {
  rowNumber: number;
  status: string;
  validationIssues: Array<{ code: string; message: string; severity: "error" | "warning" }>;
  errorCode: string | null;
  errorMessage: string | null;
};

const columns = [
  ["contactName", "Contact name"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["phoneCountryCode", "Phone country code"],
  ["companyName", "Company"],
  ["sourceIdentifier", "Source/provider ID"],
  ["sourceDetails", "Source details"],
  ["source", "Ingestion"],
  ["acquisitionSource", "Source"],
  ["status", "Status"],
  ["notes", "Notes"],
  ["nextAction", "Next action"],
  ["nextActionAt", "Next action at"],
] as const;

export function LeadImportForm() {
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState("csv_import");
  const [phoneCountryCode, setPhoneCountryCode] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [job, setJob] = useState<Job | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function handleFileChange(nextFile: File | null) {
    setFile(nextFile);
    setPreview(null);
    setMapping({});
    setJob(null);
    setRows([]);
    setError(null);
  }

  async function requestPreview() {
    if (!file) return setError("Choose a CSV or XLSX file first.");
    setBusy(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/api/v1/lead-imports/preview", { method: "POST", body: formData });
      const result = await response.json().catch(() => null);
      if (!response.ok) return setError(result?.error ?? "The file could not be previewed.");
      setPreview(result);
      setMapping(result.suggestedMapping ?? {});
    } catch {
      setError("The file could not be previewed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function createJob() {
    if (!file || !preview) return;
    setBusy(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("source", source);
      formData.set("phoneCountryCode", phoneCountryCode);
      formData.set("mapping", JSON.stringify(mapping));
      const response = await fetch("/api/v1/lead-imports", { method: "POST", body: formData });
      const result = await response.json().catch(() => null);
      if (!response.ok) return setError(result?.error ?? "The import could not be validated.");
      setJob(result);
      await loadRows(result.id);
    } catch {
      setError("The import could not be validated. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function loadRows(jobId: string) {
    try {
      const response = await fetch(`/api/v1/lead-imports/${jobId}/rows`);
      const result = await response.json().catch(() => []);
      if (response.ok) setRows(result);
      else setError(result?.error ?? "The import rows could not be loaded.");
    } catch {
      setError("The import rows could not be loaded. Check your connection and try again.");
    }
  }

  async function processJob(path: string, body?: object) {
    if (!job) return;
    setBusy(true);
    setError(null);
    try {
      const endpoint = path === "commit" ? `/api/v1/lead-imports/${job.id}` : `/api/v1/lead-imports/${job.id}/${path}`;
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
      const result = await response.json().catch(() => null);
      if (!response.ok) return setError(result?.error ?? "The import could not be processed.");
      setJob(result);
      await loadRows(job.id);
    } catch {
      setError("The import could not be processed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
         <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
           <div><h3 className="font-semibold text-text-primary">1. Choose a file</h3><p className="mt-1 text-sm text-text-secondary">CSV and XLSX files are parsed on the server. The original file is not retained.</p></div>
          <Link className="button-secondary" href="/api/v1/lead-imports/template">Download template</Link>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
           <label className="space-y-2 text-sm font-medium text-text-primary md:col-span-2">File<input className="input" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)} /></label>
           <label className="space-y-2 text-sm font-medium text-text-primary">Import source<input className="input" value={source} onChange={(event) => setSource(event.target.value)} maxLength={50} /></label>
           <label className="space-y-2 text-sm font-medium text-text-primary">Default phone country code<input className="input" placeholder="+1" value={phoneCountryCode} onChange={(event) => setPhoneCountryCode(event.target.value)} /></label>
        </div>
        <button className="button-primary mt-4" type="button" disabled={busy || !file} onClick={requestPreview}>{busy ? "Reading…" : "Preview file"}</button>
      </div>

       {preview ? <div className="card p-5">
         <h3 className="font-semibold text-text-primary">2. Confirm column mapping</h3>
         <p className="mt-1 text-sm text-text-secondary">{preview.totalRows} data rows detected{preview.worksheetName ? ` in ${preview.worksheetName}` : ""}. Contact name is required. Exact matches are linked automatically; ambiguous matches are sent for review.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
           {columns.map(([key, label]) => <label key={key} className="space-y-2 text-sm font-medium text-text-primary">{label}<select className="input" value={mapping[key] ?? ""} onChange={(event) => setMapping((current) => ({ ...current, [key]: event.target.value }))}><option value="">Not mapped</option>{preview.headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>)}
        </div>
         <div className="table-container mt-4"><table className="table"><thead><tr><th>Row</th>{preview.headers.slice(0, 6).map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{preview.sampleRows.map((row) => <tr key={row.rowNumber}><td>{row.rowNumber}</td>{preview.headers.slice(0, 6).map((header) => <td key={header} className="max-w-48 truncate">{row.values[header]}</td>)}</tr>)}</tbody></table></div>
        <button className="button-primary mt-4" type="button" disabled={busy} onClick={createJob}>{busy ? "Validating…" : "Validate and save preview"}</button>
      </div> : null}

       {job ? <div className="card p-5">
         <h3 className="font-semibold text-text-primary">3. Import summary</h3>
         <p className="mt-1 text-sm text-text-secondary">{job.status === "completed" ? "Import completed successfully." : job.status === "completed_with_errors" ? "Import completed with rows needing attention." : "Review the validation results before importing valid rows."}</p>
         <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">{[["Total", job.totalRows], ["Valid", job.validRows], ["Invalid", job.invalidRows], ["Created", job.createdCount], ["Linked", job.linkedCount], ["Review", job.needsReviewCount], ["Failed", job.failedCount]].map(([label, value]) => <div key={String(label)} className="rounded-lg bg-surface-hover p-3"><p className="text-xs uppercase text-text-muted">{label}</p><p className="mt-1 text-xl font-semibold text-text-primary">{value}</p></div>)}</div>
         <div className="mt-4 flex flex-wrap gap-2"><button className="button-primary" type="button" disabled={busy || job.validRows === 0 || job.status === "completed" || job.status === "completed_with_errors"} onClick={() => processJob("commit", { action: "commit" })}>{busy ? "Processing…" : "Import valid rows"}</button><button className="button-secondary" type="button" disabled={busy || job.failedCount === 0} onClick={() => processJob("retry")}>Retry failed rows</button>{job.invalidRows > 0 || job.failedCount > 0 ? <a className="button-secondary" href={`/api/v1/lead-imports/${job.id}/errors`}>Download error rows</a> : null}</div>
         <div className="table-container mt-5"><table className="table"><thead><tr><th>Row</th><th>Status</th><th>Issues</th></tr></thead><tbody>{rows.map((row) => <tr key={row.rowNumber}><td>{row.rowNumber}</td><td className="capitalize">{row.status.replaceAll("_", " ")}</td><td className="text-text-secondary">{[...row.validationIssues.map((issue) => `${issue.severity}: ${issue.message}`), row.errorMessage].filter(Boolean).join(" · ") || "—"}</td></tr>)}</tbody></table></div>
      </div> : null}
       {error ? <p className="rounded-lg bg-danger-light p-3 text-sm text-danger" role="alert">{error}</p> : null}
    </div>
  );
}
