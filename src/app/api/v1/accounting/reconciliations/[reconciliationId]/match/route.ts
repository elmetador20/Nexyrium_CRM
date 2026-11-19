import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { accountingErrorResponse } from "@/features/accounting/errors";
import { reconciliationService } from "@/features/accounting/server";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";

export async function POST(request: Request, { params }: { params: Promise<{ reconciliationId: string }> }) { try { const actor = await requirePermission(PERMISSIONS.ACCOUNTING_RECONCILE); const { reconciliationId } = await params; return NextResponse.json(await reconciliationService.match(actor, reconciliationId, await request.json(), request.headers.get("x-correlation-id") ?? undefined)); } catch (error) { if (error instanceof ZodError) return NextResponse.json({ error: "Invalid reconciliation match input.", code: "INVALID_INPUT" }, { status: 400 }); return accountingErrorResponse(error) ?? authorizationErrorResponse(error); } }
