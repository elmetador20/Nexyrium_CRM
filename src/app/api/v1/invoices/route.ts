import { NextResponse } from "next/server";
import { financeErrorResponse, financeValidationResponse } from "@/features/finance/shared/errors";
import { invoiceService } from "@/features/finance/server";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";

function errors(error: unknown) { return financeValidationResponse(error, "Invalid invoice input.") ?? (error instanceof SyntaxError ? NextResponse.json({ error: "Invalid invoice input.", code: "INVALID_INPUT" }, { status: 400 }) : financeErrorResponse(error) ?? authorizationErrorResponse(error)); }
export async function GET(request: Request) { try { const actor = await requirePermission(PERMISSIONS.INVOICES_READ); return NextResponse.json(await invoiceService.list(actor, Object.fromEntries(new URL(request.url).searchParams.entries()))); } catch (error) { return errors(error); } }
export async function POST(request: Request) { try { const actor = await requirePermission(PERMISSIONS.INVOICES_CREATE); return NextResponse.json(await invoiceService.create(actor, await request.json(), request.headers.get("x-correlation-id") ?? undefined), { status: 201 }); } catch (error) { return errors(error); } }
