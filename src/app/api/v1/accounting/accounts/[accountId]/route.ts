import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { accountingErrorResponse } from "@/features/accounting/errors";
import { accountingAdminService } from "@/features/accounting/server";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";

export async function PATCH(request: Request, { params }: { params: Promise<{ accountId: string }> }) { try { const actor = await requirePermission(PERMISSIONS.ACCOUNTING_MANAGE); const { accountId } = await params; return NextResponse.json(await accountingAdminService.updateAccount(actor, accountId, await request.json(), request.headers.get("x-correlation-id") ?? undefined)); } catch (error) { if (error instanceof ZodError) return NextResponse.json({ error: "Invalid accounting account input.", code: "INVALID_INPUT" }, { status: 400 }); return accountingErrorResponse(error) ?? authorizationErrorResponse(error); } }
