import { NextResponse } from "next/server";

import { csvTemplate } from "@/features/lead-intake/imports/service";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";

export async function GET() {
  try {
    await requirePermission(PERMISSIONS.CRM_LEADS_CREATE);
    return new NextResponse(csvTemplate(), {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="nexyrium-lead-import-template.csv"',
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}
