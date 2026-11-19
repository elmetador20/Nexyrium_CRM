import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { crmErrorResponse } from "@/features/crm/shared/errors";
import { runLeadIntakeTransaction } from "@/features/lead-intake/queries";
import { createLeadIntakeService } from "@/features/lead-intake/services";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";

const service = createLeadIntakeService({ transaction: runLeadIntakeTransaction });

function errorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Invalid duplicate review input.", code: "INVALID_INPUT" }, { status: 400 });
  }
  return crmErrorResponse(error) ?? authorizationErrorResponse(error);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ reviewId: string }> },
) {
  try {
    const actor = await requirePermission(PERMISSIONS.CRM_LEADS_UPDATE);
    const { reviewId } = await params;
    const result = await service.resolveDuplicate(
      actor,
      reviewId,
      await request.json(),
      request.headers.get("x-correlation-id") ?? undefined,
    );
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
