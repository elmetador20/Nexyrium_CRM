import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { runCrmTransaction } from "@/features/crm/leads/services/conversion";
import { createLeadConversionService } from "@/features/crm/leads/services/conversion-service";
import { crmErrorResponse } from "@/features/crm/shared/errors";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";

const convert = createLeadConversionService(runCrmTransaction);

export async function POST(request: Request, { params }: { params: Promise<{ leadId: string }> }) {
  try {
    const actor = await requirePermission(PERMISSIONS.CRM_LEADS_CONVERT);
    const { leadId } = await params;
    return NextResponse.json(await convert(actor, leadId, await request.json()), { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid conversion input.", code: "INVALID_INPUT" }, { status: 400 });
    return crmErrorResponse(error) ?? authorizationErrorResponse(error);
  }
}
