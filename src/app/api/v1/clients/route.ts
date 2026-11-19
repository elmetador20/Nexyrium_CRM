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

export async function GET(request: Request) {
  try {
    const actor = await requirePermission(PERMISSIONS.CRM_CLIENTS_READ);
    return NextResponse.json(await service.list(actor, Object.fromEntries(new URL(request.url).searchParams)));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requirePermission(PERMISSIONS.CRM_CLIENTS_CREATE);
    return NextResponse.json(await service.create(actor, await request.json()), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
