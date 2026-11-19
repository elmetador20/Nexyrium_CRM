import { NextResponse } from "next/server";

import { accountingErrorResponse } from "@/features/accounting/errors";
import { expenseReceiptService } from "@/features/accounting/server";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";
import { PERMISSIONS } from "@/lib/authorization/permissions";

export async function POST(request: Request, { params }: { params: Promise<{ expenseId: string }> }) {
  try {
    const actor = await requirePermission(PERMISSIONS.EXPENSES_RECEIPTS_UPLOAD);
    const { expenseId } = await params;
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "A receipt file is required.", code: "INVALID_INPUT" }, { status: 400 });
    return NextResponse.json(await expenseReceiptService.upload(actor, expenseId, file, request.headers.get("x-correlation-id") ?? undefined), { status: 201 });
  } catch (error) { return accountingErrorResponse(error) ?? authorizationErrorResponse(error); }
}
