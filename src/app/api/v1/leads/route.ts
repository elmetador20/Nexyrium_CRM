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

export async function GET(request: Request) {
  try {
    const actor = await requirePermission(PERMISSIONS.CRM_LEADS_READ);
    const result = await service.list(actor, Object.fromEntries(new URL(request.url).searchParams));
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requirePermission(PERMISSIONS.CRM_LEADS_CREATE);
    const lead = await service.create(actor, await request.json());
    return NextResponse.json(lead, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
