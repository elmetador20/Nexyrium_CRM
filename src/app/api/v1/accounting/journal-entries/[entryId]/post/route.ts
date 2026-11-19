import { NextResponse } from "next/server";

import { accountingErrorResponse } from "@/features/accounting/errors";
import { journalEntryService } from "@/features/accounting/server";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";

export async function POST(request: Request, { params }: { params: Promise<{ entryId: string }> }) { try { const actor = await requirePermission(PERMISSIONS.ACCOUNTING_POST); const { entryId } = await params; return NextResponse.json(await journalEntryService.post(actor, entryId, request.headers.get("Idempotency-Key") ?? request.headers.get("idempotency-key"), request.headers.get("x-correlation-id") ?? undefined)); } catch (error) { return accountingErrorResponse(error) ?? authorizationErrorResponse(error); } }
