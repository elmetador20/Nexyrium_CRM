import { NextResponse } from "next/server";

import { accountingErrorResponse } from "@/features/accounting/errors";
import { expenseReceiptService } from "@/features/accounting/server";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";
import { PERMISSIONS } from "@/lib/authorization/permissions";

export async function GET(request: Request, { params }: { params: Promise<{ expenseId: string; documentId: string }> }) {
  try {
    const actor = await requirePermission(PERMISSIONS.EXPENSES_READ);
    const { expenseId, documentId } = await params;
    const content = await expenseReceiptService.download(actor, expenseId, documentId, request.headers.get("x-correlation-id") ?? undefined);
    return new NextResponse(content.body as unknown as BodyInit, { status: 200, headers: { "content-type": content.mimeType, "content-length": String(content.sizeBytes), "content-disposition": `inline; filename="${content.filename.replace(/"/g, "_")}"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
  } catch (error) { return accountingErrorResponse(error) ?? authorizationErrorResponse(error); }
}
