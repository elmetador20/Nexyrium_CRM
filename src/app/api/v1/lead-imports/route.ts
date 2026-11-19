import { NextResponse } from "next/server";
import { ZodError, z } from "zod";

import { LeadImportError, leadImportErrorResponse } from "@/features/lead-intake/imports/errors";
import { parseMappingInput } from "@/features/lead-intake/imports/service";
import { leadImportService } from "./_service";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";

function errorResponse(error: unknown) {
  if (error instanceof ZodError) return NextResponse.json({ error: "Invalid import request.", code: "INVALID_INPUT" }, { status: 400 });
  return leadImportErrorResponse(error) ?? authorizationErrorResponse(error);
}

export async function POST(request: Request) {
  try {
    const actor = await requirePermission(PERMISSIONS.CRM_LEADS_CREATE);
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) throw new LeadImportError("FILE_REQUIRED", "Choose a CSV or XLSX file.");
    const source = z.string().trim().min(1).max(50).parse(formData.get("source") || "import");
    const phoneCountryCode = z.string().trim().regex(/^\+?[1-9]\d{0,2}$/).optional().nullable().parse(formData.get("phoneCountryCode") || null);
    const mapping = parseMappingInput(formData.get("mapping"));
    const parsed = await leadImportService.parse(file);
    const job = await leadImportService.createJob({ actor, parsed, mapping, source, phoneCountryCode });
    if (!job) throw new Error("Import job could not be created.");
    return NextResponse.json(job, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
