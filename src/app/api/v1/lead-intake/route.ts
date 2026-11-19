import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { createLeadIntakeService } from "@/features/lead-intake/services";
import { runLeadIntakeTransaction } from "@/features/lead-intake/queries";
import { crmErrorResponse } from "@/features/crm/shared/errors";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";

const service = createLeadIntakeService({ transaction: runLeadIntakeTransaction });

function errorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Invalid lead intake input.", code: "INVALID_INPUT" }, { status: 400 });
  }
  return crmErrorResponse(error) ?? authorizationErrorResponse(error);
}

export async function POST(request: Request) {
  try {
    const actor = await requirePermission(PERMISSIONS.CRM_LEADS_CREATE);
    const body = await request.json();
    const eventId = body?.eventId ?? request.headers.get("idempotency-key");
    const result = await service.ingest(
      actor,
      { ...body, eventId },
      request.headers.get("x-correlation-id") ?? undefined,
    );
    const status = result.outcome === "created" ? 201 : result.outcome === "needs_review" ? 202 : 200;
    return NextResponse.json(result, { status });
  } catch (error) {
    return errorResponse(error);
  }
}
