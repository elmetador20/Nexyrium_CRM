import Link from "next/link";
import { notFound } from "next/navigation";

import { ExpenseActions } from "@/features/accounting/components/ExpenseActions";
import { ReceiptCard } from "@/features/accounting/components/ReceiptCard";
import { ReceiptUploader } from "@/features/accounting/components/ReceiptUploader";
import { can } from "@/lib/authorization/policy";
import { getDriveReadiness } from "@/features/integrations/google-drive/connection";
import { DriveSetupNotice } from "@/features/integrations/google-drive/DriveSetupNotice";
import { expenseService } from "@/features/accounting/server";
import { DepartmentChip, KeyValue, PageHeader, Panel, StatusBadge } from "@/components/nx";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { requirePagePermission } from "@/lib/authorization/server";
import { formatDate, formatMinor } from "@/lib/format";
import { label, resolveLabels } from "@/lib/labels";

export const instant = false;

export default async function ExpenseDetailPage({ params }: { params: Promise<{ expenseId: string }> }) {
  const actor = await requirePagePermission(PERMISSIONS.EXPENSES_READ);
  const { expenseId } = await params;
  const result = await expenseService.get(actor, expenseId).catch(() => null);
  if (!result) notFound();
  const { expense, receipts } = result;
  const canUpload = can(actor, PERMISSIONS.EXPENSES_RECEIPTS_UPLOAD) && (expense.status === "draft" || expense.status === "submitted");
  const readiness = canUpload ? await getDriveReadiness("expense") : null;
  const labels = await resolveLabels({ users: [expense.ownerId], departments: [expense.departmentId], clients: [expense.clientId], projects: [expense.projectId] });

  return (
    <section>
      <PageHeader back={{ href: "/expenses", label: "Expenses" }} eyebrow={expense.category}
        title={<span className="flex flex-wrap items-center gap-3">{expense.description}<StatusBadge status={expense.status} /></span>}
        description={`Incurred ${formatDate(expense.incurredOn)}`} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Amount">
          <p className="text-3xl font-semibold tabular-nums tracking-tight text-text-primary">{formatMinor(expense.amountMinor, expense.currencyCode)}</p>
          <p className="mt-1 text-xs text-text-muted">{expense.status === "draft" ? "Draft — not yet counted in expense totals." : expense.status === "rejected" ? "Rejected — excluded from expense totals." : "Counted in expense totals."}</p>
          <div className="mt-5"><ExpenseActions id={expenseId} status={expense.status} /></div>
        </Panel>
        <Panel title="Details" className="lg:col-span-2">
          <dl className="grid gap-4 sm:grid-cols-2">
            <KeyValue label="Merchant" value={expense.merchantName} />
            <KeyValue label="Department" value={<DepartmentChip name={expense.departmentId ? labels.departments.get(expense.departmentId) : null} />} />
            <KeyValue label="Client" value={expense.clientId ? <Link className="nx-link" href={`/crm/clients/${expense.clientId}`}>{label(labels.clients, expense.clientId)}</Link> : null} />
            <KeyValue label="Project" value={expense.projectId ? <Link className="nx-link" href={`/projects/${expense.projectId}`}>{label(labels.projects, expense.projectId)}</Link> : null} />
            <KeyValue label="Recorded by" value={label(labels.users, expense.ownerId)} />
            <KeyValue label={expense.status === "rejected" ? "Rejection reason" : "Approval note"} value={expense.approvalReason ?? expense.rejectionReason} />
          </dl>
        </Panel>
        <Panel title="Receipts" description="Stored in Google Drive; previews are served only to people who can view this expense." className="lg:col-span-3">
          {canUpload && readiness && !readiness.ready ? <div className="mb-4"><DriveSetupNotice readiness={readiness} canManage={can(actor, PERMISSIONS.SETTINGS_MANAGE)} /></div> : null}
          {canUpload && readiness?.ready ? <div className="mb-4"><ReceiptUploader expenseId={expenseId} /></div> : null}
          {receipts.length === 0 ? <p className="text-sm text-text-muted">No receipts attached.</p> : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{receipts.map((receipt) => <ReceiptCard key={receipt.document.id} receipt={{ id: receipt.document.id, originalFilename: receipt.document.originalFilename, mimeType: receipt.document.mimeType, sizeBytes: receipt.document.sizeBytes, status: receipt.document.status, contentUrl: receipt.document.contentUrl, driveUrl: receipt.document.driveUrl }} />)}</ul>
          )}
        </Panel>
      </div>
    </section>
  );
}
