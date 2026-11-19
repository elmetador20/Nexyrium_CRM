import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { accountingErrorResponse } from "@/features/accounting/errors";
import { expenseService } from "@/features/accounting/server";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";
import { PERMISSIONS } from "@/lib/authorization/permissions";

function errorResponse(error: unknown) { if (error instanceof ZodError) return NextResponse.json({ error: "Invalid expense input.", code: "INVALID_INPUT" }, { status: 400 }); return accountingErrorResponse(error) ?? authorizationErrorResponse(error); }

export async function GET(_request: Request, { params }: { params: Promise<{ expenseId: string }> }) {
  try { const actor = await requirePermission(PERMISSIONS.EXPENSES_READ); const { expenseId } = await params; return NextResponse.json(await expenseService.get(actor, expenseId)); } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ expenseId: string }> }) {
  try { const actor = await requirePermission(PERMISSIONS.EXPENSES_UPDATE); const { expenseId } = await params; return NextResponse.json(await expenseService.update(actor, expenseId, await request.json(), request.headers.get("x-correlation-id") ?? undefined)); } catch (error) { return errorResponse(error); }
}
