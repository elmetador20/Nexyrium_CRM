import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";

import type { DriveReadiness } from "./connection";

/** Banner shown wherever files are uploaded while Google Drive is not ready. */
export function DriveSetupNotice({ readiness, canManage }: { readiness: DriveReadiness; canManage: boolean }) {
  if (readiness.ready) return null;
  return (
    <div role="status" className="flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning-light px-4 py-3 sm:flex-row sm:items-center">
      <AlertTriangle className="h-5 w-5 shrink-0 text-warning" aria-hidden />
      <p className="flex-1 text-sm text-text-primary">
        <span className="font-medium">Uploads are paused.</span> {readiness.message}{" "}
        {canManage ? null : "Ask a workspace administrator to finish the Google Drive setup."}
      </p>
      {canManage ? (
        <Link href="/settings/integrations/google-drive" className="button-secondary inline-flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-sm">
          Set up Google Drive<ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}
