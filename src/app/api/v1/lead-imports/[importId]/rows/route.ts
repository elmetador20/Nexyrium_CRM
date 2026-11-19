import { NextResponse } from "next/server";

import { leadImportService } from "../../_service";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";
import { leadImportErrorResponse } from "@/features/lead-intake/imports/errors";

export async function GET(_request: Request, { params }: { params: Promise<{ importId: string }> }) {
  try {
    const actor = await requirePermission(PERMISSIONS.CRM_LEADS_CREATE);
    const { importId } = await params;
    return NextResponse.json(await leadImportService.getRows(actor, importId));
  } catch (error) {
    return leadImportErrorResponse(error) ?? authorizationErrorResponse(error);
  }
}
