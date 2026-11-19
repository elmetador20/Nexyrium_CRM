import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { accountingErrorResponse } from "@/features/accounting/errors";
import { expenseService } from "@/features/accounting/server";
import { authorizationErrorResponse, requireActor } from "@/lib/authorization/server";

function errorResponse(error: unknown) { if (error instanceof ZodError) return NextResponse.json({ error: "Invalid expense transition.", code: "INVALID_INPUT" }, { status: 400 }); return accountingErrorResponse(error) ?? authorizationErrorResponse(error); }

export async function POST(request: Request, { params }: { params: Promise<{ expenseId: string }> }) {
  try {
    const actor = await requireActor();
    const { expenseId } = await params;
    const body = await request.json();
    const correlationId = request.headers.get("x-correlation-id") ?? undefined;
    if (body.action === "submit") return NextResponse.json(await expenseService.submit(actor, expenseId, correlationId));
    if (body.action === "approve") return NextResponse.json(await expenseService.approve(actor, expenseId, body.input, correlationId));
    if (body.action === "reject") return NextResponse.json(await expenseService.reject(actor, expenseId, body.input, correlationId));
    return NextResponse.json({ error: "Unknown expense transition.", code: "INVALID_INPUT" }, { status: 400 });
  } catch (error) { return errorResponse(error); }
}
