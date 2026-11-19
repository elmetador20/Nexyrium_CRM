import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { financeErrorResponse } from "@/features/finance/shared/errors";
import { invoiceService } from "@/features/finance/server";
import { authorizationErrorResponse, requireActor } from "@/lib/authorization/server";

export async function GET(request: Request) {
  try {
    const actor = await requireActor();
    return NextResponse.json(await invoiceService.listClients(actor, Object.fromEntries(new URL(request.url).searchParams.entries())));
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid client search.", code: "INVALID_INPUT" }, { status: 400 });
    return financeErrorResponse(error) ?? authorizationErrorResponse(error);
  }
}
