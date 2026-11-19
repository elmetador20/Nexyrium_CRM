import { NextResponse } from "next/server";

import { leadImportService } from "../../_service";
import { leadImportErrorResponse } from "@/features/lead-intake/imports/errors";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";

export async function POST(_request: Request, { params }: { params: Promise<{ importId: string }> }) {
  try {
    const actor = await requirePermission(PERMISSIONS.CRM_LEADS_CREATE);
    const { importId } = await params;
    return NextResponse.json(await leadImportService.process(actor, importId, true));
  } catch (error) {
    return leadImportErrorResponse(error) ?? authorizationErrorResponse(error);
  }
}
