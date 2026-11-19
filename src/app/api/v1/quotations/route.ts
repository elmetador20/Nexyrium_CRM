import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { financeErrorResponse } from "@/features/finance/shared/errors";
import { quotationService } from "@/features/finance/server";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";

function errors(error: unknown) { if (error instanceof ZodError) return NextResponse.json({ error: "Invalid quotation input.", code: "INVALID_INPUT" }, { status: 400 }); return financeErrorResponse(error) ?? authorizationErrorResponse(error); }

export async function GET(request: Request) {
  try { const actor = await requirePermission(PERMISSIONS.QUOTATIONS_READ); return NextResponse.json(await quotationService.list(actor, Object.fromEntries(new URL(request.url).searchParams.entries()))); } catch (error) { return errors(error); }
}
export async function POST(request: Request) {
  try { const actor = await requirePermission(PERMISSIONS.QUOTATIONS_CREATE); return NextResponse.json(await quotationService.create(actor, await request.json(), request.headers.get("x-correlation-id") ?? undefined), { status: 201 }); } catch (error) { return errors(error); }
}
