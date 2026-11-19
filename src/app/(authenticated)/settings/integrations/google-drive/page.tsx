import { CheckCircle2, CircleDashed, FolderOpen, XCircle } from "lucide-react";

import { DriveControls } from "@/features/integrations/google-drive/DriveControls";
import { getConnectionSummary } from "@/features/integrations/google-drive/connection";
import { KeyValue, PageHeader, Panel, StatusBadge } from "@/components/nx";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { can } from "@/lib/authorization/policy";
import { requirePagePermission } from "@/lib/authorization/server";
import { getGoogleDriveConfigurationStatus, getGoogleDriveEnv } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { StorageError } from "@/lib/storage";

export const instant = false;

function Step({ done, children }: { done: boolean; children: React.ReactNode }) {
  return <li className="flex items-start gap-2 text-sm">{done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden /> : <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" aria-hidden />}<span className={done ? "text-text-primary" : "text-text-secondary"}>{children}</span></li>;
}

export default async function GoogleDriveIntegrationPage({ searchParams }: { searchParams: Promise<{ connected?: string }> }) {
  const actor = await requirePagePermission(PERMISSIONS.SETTINGS_READ);
  const { connected: justConnected } = await searchParams;
  const config = getGoogleDriveConfigurationStatus();
  let env: ReturnType<typeof getGoogleDriveEnv> | null = null;
  try { env = getGoogleDriveEnv(); } catch { env = null; }
  let connection: Awaited<ReturnType<typeof getConnectionSummary>> = null;
  let setupError: string | null = null;
  if (config.configured) {
    try { connection = await getConnectionSummary(); }
    catch (error) { setupError = error instanceof StorageError ? error.message : "The Google Drive connection could not be loaded."; }
  }
  const pickerConfigured = Boolean(env?.GOOGLE_PICKER_API_KEY && env?.GOOGLE_CLOUD_PROJECT_NUMBER);
  const folderReady = Boolean(connection?.folderId && connection.folderVerifiedAt);
  const manage = can(actor, PERMISSIONS.SETTINGS_MANAGE);

  return (
    <section className="mx-auto max-w-4xl">
      <PageHeader back={{ href: "/settings/integrations", label: "Integrations" }} eyebrow="Integrations" title="Google Drive"
        description="Expense receipts are stored in your Google Drive folder using the limited drive.file permission — the app can only see files it created or folders you explicitly choose." />
      {setupError ? <p role="alert" className="mb-4 rounded-lg bg-warning-light px-3 py-2 text-sm">{setupError}</p> : null}
      {justConnected && !connection && !setupError ? (
        <p role="alert" className="mb-4 rounded-lg bg-warning-light px-3 py-2 text-sm">Google did not return Drive access. Make sure you ticked the Google Drive permission on the consent screen, then try Connect again.</p>
      ) : null}
      <div className="grid gap-4">
        <Panel title="Setup" description="Receipts upload once all three steps are complete.">
          <ul className="space-y-2">
            <Step done={config.configured}>Server configuration {config.configured ? "is complete" : <>is missing: <code className="text-xs">{config.missing.join(", ")}</code></>}</Step>
            <Step done={Boolean(connection)}>Google account connected {connection ? <>as <strong>{connection.googleAccountEmail}</strong></> : null}</Step>
            <Step done={folderReady}>Receipts folder authorized {folderReady ? <>— <strong>{connection?.folderName}</strong></> : null}</Step>
          </ul>
          {!pickerConfigured ? <p className="mt-3 text-xs text-text-muted">Choosing a folder needs <code>GOOGLE_PICKER_API_KEY</code> and <code>GOOGLE_CLOUD_PROJECT_NUMBER</code>.</p> : null}
        </Panel>

        <Panel title="Connection">
          {connection ? (
            <dl className="grid gap-4 sm:grid-cols-2">
              <KeyValue label="Status" value={<StatusBadge tone="success">Connected</StatusBadge>} />
              <KeyValue label="Google account" value={connection.googleAccountEmail} />
              <KeyValue label="Connected" value={formatDate(connection.createdAt, true)} />
              <KeyValue label="Permission" value="drive.file (app-created files and chosen folders only)" />
              <KeyValue label="Receipts folder" value={folderReady ? <a className="nx-link inline-flex items-center gap-1.5" href={`https://drive.google.com/drive/folders/${connection.folderId}`} target="_blank" rel="noreferrer"><FolderOpen className="h-4 w-4" aria-hidden />{connection.folderName}</a> : <span className="inline-flex items-center gap-1.5 text-warning"><XCircle className="h-4 w-4" aria-hidden />Not authorized yet</span>} />
              <KeyValue label="Folder verified" value={connection.folderVerifiedAt ? formatDate(connection.folderVerifiedAt, true) : null} />
            </dl>
          ) : <p className="text-sm text-text-secondary">Not connected. Connecting uses your existing Google sign-in and asks only for the Google Drive “files created or opened by this app” permission.</p>}
          {manage && !setupError ? <div className="mt-5 border-t border-border pt-4"><DriveControls connected={Boolean(connection)} folderReady={folderReady} configuredFolderId={env?.GOOGLE_DRIVE_FOLDER_ID ?? null} pickerConfigured={pickerConfigured} /></div> : <p className="mt-4 text-xs text-text-muted">Only workspace administrators can change this connection.</p>}
        </Panel>
      </div>
    </section>
  );
}
