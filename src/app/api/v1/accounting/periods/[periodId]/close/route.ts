import { NextResponse } from "next/server";

import { accountingErrorResponse } from "@/features/accounting/errors";
import { accountingAdminService } from "@/features/accounting/server";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";

export async function POST(request: Request, { params }: { params: Promise<{ periodId: string }> }) { try { const actor = await requirePermission(PERMISSIONS.ACCOUNTING_PERIOD_CLOSE); const { periodId } = await params; return NextResponse.json(await accountingAdminService.closePeriod(actor, periodId, request.headers.get("x-correlation-id") ?? undefined)); } catch (error) { return accountingErrorResponse(error) ?? authorizationErrorResponse(error); } }
