import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { clientRepository } from "@/features/crm/clients/queries";
import { createClientService } from "@/features/crm/clients/services";
import { crmErrorResponse } from "@/features/crm/shared/errors";
import { recordAuditEvent } from "@/lib/audit/service";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";

const service = createClientService({ repository: clientRepository, audit: recordAuditEvent });

function errorResponse(error: unknown) {
  if (error instanceof ZodError) return NextResponse.json({ error: "Invalid client input.", code: "INVALID_INPUT" }, { status: 400 });
  return crmErrorResponse(error) ?? authorizationErrorResponse(error);
}

export async function GET(_request: Request, { params }: { params: Promise<{ clientId: string }> }) {
  try {
    const actor = await requirePermission(PERMISSIONS.CRM_CLIENTS_READ);
    const { clientId } = await params;
    return NextResponse.json(await service.get(actor, clientId));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ clientId: string }> }) {
  try {
    const actor = await requirePermission(PERMISSIONS.CRM_CLIENTS_UPDATE);
    const { clientId } = await params;
    return NextResponse.json(await service.update(actor, clientId, await request.json()));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ clientId: string }> }) {
  try {
    const actor = await requirePermission(PERMISSIONS.CRM_CLIENTS_DELETE);
    const { clientId } = await params;
    return NextResponse.json(await service.archive(actor, clientId));
  } catch (error) {
    return errorResponse(error);
  }
}
