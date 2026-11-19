import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { leadRepository } from "@/features/crm/leads/queries";
import { createLeadService } from "@/features/crm/leads/services";
import { crmErrorResponse } from "@/features/crm/shared/errors";
import { recordAuditEvent } from "@/lib/audit/service";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";

const service = createLeadService({ repository: leadRepository, audit: recordAuditEvent });

function errorResponse(error: unknown) {
  if (error instanceof ZodError) return NextResponse.json({ error: "Invalid lead input.", code: "INVALID_INPUT" }, { status: 400 });
  return crmErrorResponse(error) ?? authorizationErrorResponse(error);
}

export async function GET(_request: Request, { params }: { params: Promise<{ leadId: string }> }) {
  try {
    const actor = await requirePermission(PERMISSIONS.CRM_LEADS_READ);
    const { leadId } = await params;
    return NextResponse.json(await service.get(actor, leadId));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ leadId: string }> }) {
  try {
    const actor = await requirePermission(PERMISSIONS.CRM_LEADS_UPDATE);
    const { leadId } = await params;
    return NextResponse.json(await service.update(actor, leadId, await request.json()));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ leadId: string }> }) {
  try {
    const actor = await requirePermission(PERMISSIONS.CRM_LEADS_DELETE);
    const { leadId } = await params;
    return NextResponse.json(await service.archive(actor, leadId));
  } catch (error) {
    return errorResponse(error);
  }
}
