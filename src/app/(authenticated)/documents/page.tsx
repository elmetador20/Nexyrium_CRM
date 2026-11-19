import { DocumentWorkspace } from "@/features/documents/components/DocumentWorkspace";
import { getDocumentRecordOptions } from "@/features/documents/record-options";
import { getDocumentService } from "@/features/documents/server";
import { getDriveReadiness } from "@/features/integrations/google-drive/connection";
import { DriveSetupNotice } from "@/features/integrations/google-drive/DriveSetupNotice";
import { PageHeader } from "@/components/nx";
import { can } from "@/lib/authorization/policy";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { requirePagePermission } from "@/lib/authorization/server";

export const instant = false;

export default async function DocumentsPage() {
  const actor = await requirePagePermission(PERMISSIONS.DOCUMENTS_READ);
  const canUpload = can(actor, PERMISSIONS.DOCUMENTS_CREATE);
  const [result, readiness, recordOptions] = await Promise.all([
    getDocumentService().list(actor, { page: 1, pageSize: 100 }),
    getDriveReadiness(),
    canUpload ? getDocumentRecordOptions(actor) : Promise.resolve([]),
  ]);
  return (
    <section>
      <PageHeader eyebrow="Work" title="Documents" description="Files stay private in Google Drive and are served only through authorized requests." />
      {canUpload ? <div className="mb-4"><DriveSetupNotice readiness={readiness} canManage={can(actor, PERMISSIONS.SETTINGS_MANAGE)} /></div> : null}
      <DocumentWorkspace initialDocuments={result.items.map((document) => ({ ...document, createdAt: document.createdAt.toISOString() }))} canUpload={canUpload} uploadsReady={readiness.ready} recordOptions={recordOptions} />
    </section>
  );
}
