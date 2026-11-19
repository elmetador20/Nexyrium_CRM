import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { leadRepository } from "@/features/crm/leads/queries";
import { createLeadService } from "@/features/crm/leads/services";
import { crmErrorResponse } from "@/features/crm/shared/errors";
import { recordAuditEvent } from "@/lib/audit/service";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";

const service = createLeadService({ repository: leadRepository, audit: recordAuditEvent });

export async function POST(request: Request, { params }: { params: Promise<{ leadId: string }> }) {
  try {
    const actor = await requirePermission(PERMISSIONS.CRM_LEADS_UPDATE);
    const { leadId } = await params;
    return NextResponse.json(await service.addActivity(actor, leadId, await request.json()), { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid activity input.", code: "INVALID_INPUT" }, { status: 400 });
    return crmErrorResponse(error) ?? authorizationErrorResponse(error);
  }
}
