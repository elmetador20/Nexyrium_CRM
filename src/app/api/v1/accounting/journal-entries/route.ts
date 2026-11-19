import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { accountingErrorResponse } from "@/features/accounting/errors";
import { journalEntryService } from "@/features/accounting/server";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";

export async function GET(request: Request) { try { const actor = await requirePermission(PERMISSIONS.ACCOUNTING_READ); return NextResponse.json(await journalEntryService.list(actor, Object.fromEntries(new URL(request.url).searchParams.entries()))); } catch (error) { return accountingErrorResponse(error) ?? authorizationErrorResponse(error); } }
export async function POST(request: Request) { try { const actor = await requirePermission(PERMISSIONS.ACCOUNTING_MANAGE); return NextResponse.json(await journalEntryService.create(actor, await request.json(), request.headers.get("x-correlation-id") ?? undefined), { status: 201 }); } catch (error) { if (error instanceof ZodError) return NextResponse.json({ error: "Invalid journal entry input.", code: "INVALID_INPUT" }, { status: 400 }); return accountingErrorResponse(error) ?? authorizationErrorResponse(error); } }
