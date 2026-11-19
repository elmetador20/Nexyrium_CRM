import { NextResponse } from "next/server";

import { LeadImportError, leadImportErrorResponse } from "@/features/lead-intake/imports/errors";
import { leadImportService } from "../_service";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";

function errorResponse(error: unknown) {
  return leadImportErrorResponse(error) ?? authorizationErrorResponse(error);
}

export async function GET(_request: Request, { params }: { params: Promise<{ importId: string }> }) {
  try {
    const actor = await requirePermission(PERMISSIONS.CRM_LEADS_CREATE);
    const { importId } = await params;
    return NextResponse.json(await leadImportService.getJob(actor, importId));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ importId: string }> }) {
  try {
    const actor = await requirePermission(PERMISSIONS.CRM_LEADS_CREATE);
    const { importId } = await params;
    const body = await request.json().catch(() => ({}));
    if (body?.action !== "commit") throw new LeadImportError("IMPORT_NOT_READY", "Use action=commit to process this import.");
    return NextResponse.json(await leadImportService.process(actor, importId, false));
  } catch (error) {
    return errorResponse(error);
  }
}
