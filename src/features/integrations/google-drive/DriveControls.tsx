"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2, FolderSearch, Loader2, Plug, Unplug, AlertTriangle } from "lucide-react";

import { connectGoogleDrive, disconnectGoogleDrive, savePickedFolder, verifyConfiguredFolder, type DriveActionState } from "./actions";

type PickerResponse = { action: string; docs?: Array<{ id: string; name?: string }> };
type GooglePickerNamespace = {
  ViewId: { FOLDERS: string };
  Action: { PICKED: string; CANCEL: string };
  DocsView: new (viewId?: string) => { setIncludeFolders(v: boolean): unknown; setSelectFolderEnabled(v: boolean): unknown; setMimeTypes(v: string): unknown; setFileIds?(ids: string): unknown };
  PickerBuilder: new () => {
    addView(view: unknown): GooglePickerBuilder;
  };
};
type GooglePickerBuilder = {
  addView(view: unknown): GooglePickerBuilder; setOAuthToken(t: string): GooglePickerBuilder; setDeveloperKey(k: string): GooglePickerBuilder;
  setAppId(id: string): GooglePickerBuilder; setTitle(t: string): GooglePickerBuilder; setCallback(cb: (d: PickerResponse) => void): GooglePickerBuilder;
  build(): { setVisible(v: boolean): void };
};
declare global {
  interface Window { gapi?: { load(name: string, cb: () => void): void }; google?: { picker?: GooglePickerNamespace } }
}

let pickerScript: Promise<GooglePickerNamespace> | null = null;
function loadPicker(): Promise<GooglePickerNamespace> {
  pickerScript ??= new Promise((resolve, reject) => {
    const done = () => window.gapi!.load("picker", () => (window.google?.picker ? resolve(window.google.picker) : reject(new Error("Picker failed to load."))));
    if (window.gapi) return done();
    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.async = true;
    script.onload = done;
    script.onerror = () => { pickerScript = null; reject(new Error("Could not load Google Picker. Check your connection.")); };
    document.head.appendChild(script);
  });
  return pickerScript;
}

function Notice({ state }: { state: DriveActionState }) {
  if (state.status === "idle" || !state.message) return null;
  const ok = state.status === "success";
  return (
    <p role={ok ? "status" : "alert"} className={`mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${ok ? "bg-success-light text-success" : "bg-warning-light text-text-primary"}`}>
      {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />}
      {state.message}
    </p>
  );
}

export function DriveControls({ connected, folderReady, configuredFolderId, pickerConfigured }: { connected: boolean; folderReady: boolean; configuredFolderId: string | null; pickerConfigured: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<DriveActionState>({ status: "idle" });
  const [busy, setBusy] = useState<null | "connect" | "verify" | "picker" | "disconnect">(null);
  const [, startTransition] = useTransition();

  function run(kind: NonNullable<typeof busy>, task: () => Promise<DriveActionState>) {
    setBusy(kind);
    setState({ status: "idle" });
    startTransition(async () => {
      try { setState(await task()); router.refresh(); }
      catch { setState({ status: "error", message: "Something went wrong. Try again." }); }
      finally { setBusy(null); }
    });
  }

  async function openPicker(): Promise<DriveActionState> {
    const response = await fetch("/api/v1/integrations/google-drive/picker-token", { cache: "no-store" });
    const body = await response.json().catch(() => null) as { accessToken?: string; apiKey?: string; appId?: string; error?: string } | null;
    if (!response.ok || !body?.accessToken || !body.apiKey || !body.appId) return { status: "error", message: body?.error ?? "Google Picker could not be opened." };
    const picker = await loadPicker();
    const view = new picker.DocsView(picker.ViewId.FOLDERS);
    view.setIncludeFolders(true);
    view.setSelectFolderEnabled(true);
    view.setMimeTypes("application/vnd.google-apps.folder");
    if (configuredFolderId && typeof view.setFileIds === "function") view.setFileIds(configuredFolderId);
    const picked = await new Promise<PickerResponse>((resolve) => {
      new picker.PickerBuilder().addView(view).setOAuthToken(body.accessToken!).setDeveloperKey(body.apiKey!).setAppId(body.appId!)
        .setTitle("Select the Nexyrium OS Receipts folder")
        .setCallback((data) => { if (data.action === picker.Action.PICKED || data.action === picker.Action.CANCEL) resolve(data); })
        .build().setVisible(true);
    });
    const folder = picked.action === picker.Action.PICKED ? picked.docs?.[0] : undefined;
    if (!folder) return { status: "idle" };
    return savePickedFolder(folder.id);
  }

  const spinner = <Loader2 className="h-4 w-4 animate-spin" aria-hidden />;
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <form action={() => { setBusy("connect"); return connectGoogleDrive(); }}>
          <button className={connected ? "button-secondary inline-flex items-center gap-1.5 px-3 py-2 text-sm" : "button-primary inline-flex items-center gap-1.5 px-3 py-2 text-sm"} disabled={busy !== null}>
            {busy === "connect" ? spinner : <Plug className="h-4 w-4" aria-hidden />}{connected ? "Reconnect Google Drive" : "Connect Google Drive"}
          </button>
        </form>
        {connected ? (
          <>
            <button type="button" className="button-secondary inline-flex items-center gap-1.5 px-3 py-2 text-sm" disabled={busy !== null} onClick={() => run("verify", verifyConfiguredFolder)}>
              {busy === "verify" ? spinner : <CheckCircle2 className="h-4 w-4" aria-hidden />}Check configured folder
            </button>
            <button type="button" className={folderReady ? "button-secondary inline-flex items-center gap-1.5 px-3 py-2 text-sm" : "button-primary inline-flex items-center gap-1.5 px-3 py-2 text-sm"} disabled={busy !== null || !pickerConfigured} title={pickerConfigured ? undefined : "Set GOOGLE_PICKER_API_KEY and GOOGLE_CLOUD_PROJECT_NUMBER first"} onClick={() => run("picker", openPicker)}>
              {busy === "picker" ? spinner : <FolderSearch className="h-4 w-4" aria-hidden />}Choose folder in Google Drive
            </button>
            <button type="button" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-danger hover:bg-danger-light" disabled={busy !== null}
              onClick={() => { if (window.confirm("Disconnect Google Drive? New receipts cannot be uploaded until it is reconnected. Existing receipt records and Drive files are kept.")) run("disconnect", disconnectGoogleDrive); }}>
              {busy === "disconnect" ? spinner : <Unplug className="h-4 w-4" aria-hidden />}Disconnect
            </button>
          </>
        ) : null}
      </div>
      {state.status === "needs_picker" && !pickerConfigured ? <Notice state={{ status: "error", message: `${state.message} The picker needs GOOGLE_PICKER_API_KEY and GOOGLE_CLOUD_PROJECT_NUMBER in the server environment.` }} /> : <Notice state={state} />}
    </div>
  );
}
