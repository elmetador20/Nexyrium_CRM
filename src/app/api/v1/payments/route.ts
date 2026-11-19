import { NextResponse } from "next/server";
import { financeErrorResponse, financeValidationResponse } from "@/features/finance/shared/errors";
import { paymentService } from "@/features/finance/server";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";

export async function GET(request: Request) { try { const actor = await requirePermission(PERMISSIONS.PAYMENTS_READ); return NextResponse.json(await paymentService.list(actor, new URL(request.url).searchParams.get("clientId") ?? undefined)); } catch (error) { return financeValidationResponse(error, "Invalid payment filter.") ?? (error instanceof SyntaxError ? NextResponse.json({ error: "Invalid payment filter.", code: "INVALID_INPUT" }, { status: 400 }) : financeErrorResponse(error) ?? authorizationErrorResponse(error)); } }
export async function POST(request: Request) { try { const actor = await requirePermission(PERMISSIONS.PAYMENTS_CREATE); return NextResponse.json(await paymentService.create(actor, await request.json(), request.headers.get("x-correlation-id") ?? undefined), { status: 201 }); } catch (error) { return financeValidationResponse(error, "Invalid payment input.") ?? (error instanceof SyntaxError ? NextResponse.json({ error: "Invalid payment input.", code: "INVALID_INPUT" }, { status: 400 }) : financeErrorResponse(error) ?? authorizationErrorResponse(error)); } }
