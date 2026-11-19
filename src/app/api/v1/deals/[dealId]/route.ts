import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { dealRepository } from "@/features/crm/deals/queries";
import { createDealService } from "@/features/crm/deals/services";
import { crmErrorResponse } from "@/features/crm/shared/errors";
import { recordAuditEvent } from "@/lib/audit/service";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";

const service = createDealService({ repository: dealRepository, audit: recordAuditEvent });

function errorResponse(error: unknown) {
  if (error instanceof ZodError) return NextResponse.json({ error: "Invalid deal input.", code: "INVALID_INPUT" }, { status: 400 });
  return crmErrorResponse(error) ?? authorizationErrorResponse(error);
}

export async function GET(_request: Request, { params }: { params: Promise<{ dealId: string }> }) {
  try {
    const actor = await requirePermission(PERMISSIONS.CRM_DEALS_READ);
    const { dealId } = await params;
    return NextResponse.json(await service.get(actor, dealId));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ dealId: string }> }) {
  try {
    const actor = await requirePermission(PERMISSIONS.CRM_DEALS_UPDATE);
    const { dealId } = await params;
    return NextResponse.json(await service.update(actor, dealId, await request.json()));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ dealId: string }> }) {
  try {
    const actor = await requirePermission(PERMISSIONS.CRM_DEALS_DELETE);
    const { dealId } = await params;
    return NextResponse.json(await service.archive(actor, dealId));
  } catch (error) {
    return errorResponse(error);
  }
}
