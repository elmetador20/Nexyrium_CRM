"use client";

import { useState } from "react";
import { AlertTriangle, ExternalLink, FileText, Maximize2, X } from "lucide-react";

export type ReceiptView = {
  id: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  contentUrl: string;
  driveUrl: string | null;
};

function size(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Receipt preview served through the authorized content route, plus an Open-in-Drive link. */
export function ReceiptCard({ receipt }: { receipt: ReceiptView }) {
  const [open, setOpen] = useState(false);
  const [broken, setBroken] = useState(false);
  const available = receipt.status === "available";
  const image = receipt.mimeType.startsWith("image/");

  if (!available) {
    return (
      <li className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-warning-light text-warning" aria-hidden><AlertTriangle className="h-5 w-5" /></span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-text-primary">{receipt.originalFilename}</span>
          <span className="block text-xs text-text-muted">{receipt.status === "pending" ? "Upload in progress or interrupted." : "Upload failed — the file never reached Google Drive. Attach it again."}</span>
        </span>
      </li>
    );
  }

  return (
    <li className="overflow-hidden rounded-xl border border-border bg-surface">
      <button type="button" onClick={() => setOpen(true)} className="group relative block aspect-[4/3] w-full bg-surface-muted" aria-label={`Preview ${receipt.originalFilename}`}>
        {image && !broken ? (
          // eslint-disable-next-line @next/next/no-img-element -- authorized, private, non-optimizable content route
          <img src={receipt.contentUrl} alt={`Receipt ${receipt.originalFilename}`} loading="lazy" onError={() => setBroken(true)} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full flex-col items-center justify-center gap-1 text-text-muted">
            {broken ? <AlertTriangle className="h-7 w-7 text-warning" aria-hidden /> : <FileText className="h-8 w-8" aria-hidden />}
            <span className="text-xs">{broken ? "Preview unavailable" : "PDF receipt"}</span>
          </span>
        )}
        <span className="absolute right-2 top-2 rounded-md bg-surface/90 p-1 opacity-0 shadow-sm transition-opacity group-hover:opacity-100" aria-hidden><Maximize2 className="h-3.5 w-3.5" /></span>
      </button>
      <div className="flex items-center gap-2 p-3">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-text-primary">{receipt.originalFilename}</span>
          <span className="block text-xs text-text-muted">{receipt.mimeType === "application/pdf" ? "PDF" : receipt.mimeType.replace("image/", "").toUpperCase()} · {size(receipt.sizeBytes)}</span>
        </span>
        {receipt.driveUrl ? <a href={receipt.driveUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline">Drive<ExternalLink className="h-3.5 w-3.5" aria-hidden /></a> : null}
      </div>
      {open ? (
        <div role="dialog" aria-modal="true" aria-label={`Receipt ${receipt.originalFilename}`} className="fixed inset-0 z-50 flex flex-col bg-black/70 p-3 sm:p-8" onClick={() => setOpen(false)}>
          <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-2 pb-2 text-white" onClick={(event) => event.stopPropagation()}>
            <span className="truncate text-sm font-medium">{receipt.originalFilename}</span>
            <span className="flex shrink-0 items-center gap-2">
              <a href={receipt.contentUrl} target="_blank" rel="noreferrer" className="rounded-md bg-white/15 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-white/25">Open file</a>
              {receipt.driveUrl ? <a href={receipt.driveUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md bg-white/15 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-white/25">Open in Drive<ExternalLink className="h-3.5 w-3.5" aria-hidden /></a> : null}
              <button type="button" onClick={() => setOpen(false)} className="rounded-md bg-white/15 p-1.5 hover:bg-white/25" aria-label="Close preview"><X className="h-4 w-4" /></button>
            </span>
          </div>
          <div className="mx-auto min-h-0 w-full max-w-4xl flex-1 overflow-hidden rounded-xl bg-white" onClick={(event) => event.stopPropagation()}>
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element -- authorized, private content route
              <img src={receipt.contentUrl} alt={`Receipt ${receipt.originalFilename}`} className="h-full w-full object-contain" />
            ) : (
              <iframe src={receipt.contentUrl} title={`Receipt ${receipt.originalFilename}`} className="h-full w-full" />
            )}
          </div>
        </div>
      ) : null}
    </li>
  );
}
