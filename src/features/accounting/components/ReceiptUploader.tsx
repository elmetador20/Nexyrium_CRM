"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, UploadCloud } from "lucide-react";

import { checkReceiptMetadata, RECEIPT_ACCEPT } from "../receipt-file";

type State =
  | { kind: "idle" }
  | { kind: "uploading"; name: string }
  | { kind: "success"; name: string; driveUrl: string | null }
  | { kind: "error"; message: string };

export function ReceiptUploader({ expenseId }: { expenseId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);
  const router = useRouter();

  async function upload(file: File) {
    const invalid = checkReceiptMetadata(file);
    if (invalid && !invalid.ok) return setState({ kind: "error", message: invalid.message });
    setState({ kind: "uploading", name: file.name });
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch(`/api/v1/expenses/${expenseId}/receipts`, { method: "POST", body: form });
      const result = await response.json().catch(() => null) as { error?: string; driveUrl?: string | null } | null;
      if (!response.ok) return setState({ kind: "error", message: result?.error ?? "The receipt could not be uploaded." });
      setState({ kind: "success", name: file.name, driveUrl: result?.driveUrl ?? null });
      router.refresh();
    } catch {
      setState({ kind: "error", message: "Network error — the receipt was not uploaded. Check your connection and try again." });
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const uploading = state.kind === "uploading";
  return (
    <div>
      <label
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0]; if (file && !uploading) void upload(file); }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-5 text-center transition-colors ${dragging ? "border-primary bg-primary-light" : "border-border-strong bg-surface-muted hover:border-primary"} ${uploading ? "pointer-events-none opacity-70" : ""}`}
      >
        {uploading ? <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden /> : <UploadCloud className="h-5 w-5 text-primary" aria-hidden />}
        <span className="text-sm font-medium text-text-primary">{uploading ? `Uploading ${state.name} to Google Drive…` : "Attach a receipt"}</span>
        <span className="text-xs text-text-muted">PDF, JPEG, PNG or WebP · up to 10 MB · tap to choose or drop a file</span>
        <input ref={inputRef} type="file" accept={RECEIPT_ACCEPT} className="sr-only" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
      </label>
      <div aria-live="polite">
        {state.kind === "success" ? (
          <p role="status" className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-success">
            <CheckCircle2 className="h-4 w-4" aria-hidden />{state.name} was saved to Google Drive.
            {state.driveUrl ? <a className="inline-flex items-center gap-1 font-medium text-primary hover:underline" href={state.driveUrl} target="_blank" rel="noreferrer">Open in Drive<ExternalLink className="h-3.5 w-3.5" aria-hidden /></a> : null}
          </p>
        ) : null}
        {state.kind === "error" ? <p role="alert" className="mt-2 flex items-start gap-1.5 text-sm text-danger"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{state.message}</p> : null}
      </div>
    </div>
  );
}
