import { NextResponse } from "next/server";

import { leadImportErrorResponse } from "@/features/lead-intake/imports/errors";
import { leadImportService } from "../../_service";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";

export async function GET(_request: Request, { params }: { params: Promise<{ importId: string }> }) {
  try {
    const actor = await requirePermission(PERMISSIONS.CRM_LEADS_CREATE);
    const { importId } = await params;
    const result = await leadImportService.exportErrors(actor, importId);
    return new NextResponse(result.content, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${result.filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return leadImportErrorResponse(error) ?? authorizationErrorResponse(error);
  }
}
