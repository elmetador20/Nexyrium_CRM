import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { LeadImportError, leadImportErrorResponse } from "@/features/lead-intake/imports/errors";
import { leadImportService } from "../_service";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";

function errorResponse(error: unknown) {
  if (error instanceof ZodError) return NextResponse.json({ error: "Invalid import request.", code: "INVALID_INPUT" }, { status: 400 });
  return leadImportErrorResponse(error) ?? authorizationErrorResponse(error);
}

export async function POST(request: Request) {
  try {
    await requirePermission(PERMISSIONS.CRM_LEADS_CREATE);
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) throw new LeadImportError("FILE_REQUIRED", "Choose a CSV or XLSX file.");
    const preview = leadImportService.preview(await leadImportService.parse(file));
    return NextResponse.json(preview);
  } catch (error) {
    return errorResponse(error);
  }
}
