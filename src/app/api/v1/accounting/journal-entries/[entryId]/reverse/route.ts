import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { accountingErrorResponse } from "@/features/accounting/errors";
import { journalEntryService } from "@/features/accounting/server";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";

export async function POST(request: Request, { params }: { params: Promise<{ entryId: string }> }) { try { const actor = await requirePermission(PERMISSIONS.ACCOUNTING_REVERSE); const { entryId } = await params; return NextResponse.json(await journalEntryService.reverse(actor, entryId, await request.json(), request.headers.get("Idempotency-Key") ?? request.headers.get("idempotency-key"), request.headers.get("x-correlation-id") ?? undefined)); } catch (error) { if (error instanceof ZodError) return NextResponse.json({ error: "Invalid journal reversal input.", code: "INVALID_INPUT" }, { status: 400 }); return accountingErrorResponse(error) ?? authorizationErrorResponse(error); } }
