import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { documentErrorResponse, DocumentError } from "@/features/documents/errors";
import { getDocumentService } from "@/features/documents/server";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";

function errorResponse(error: unknown) {
  if (error instanceof ZodError) return NextResponse.json({ error: "Invalid document input.", code: "INVALID_INPUT" }, { status: 400 });
  return documentErrorResponse(error) ?? authorizationErrorResponse(error);
}

export async function GET(request: Request) {
  try {
    const actor = await requirePermission(PERMISSIONS.DOCUMENTS_READ);
    const params = new URL(request.url).searchParams;
    return NextResponse.json(await getDocumentService().list(actor, {
      recordType: params.get("recordType") || undefined,
      recordId: params.get("recordId") || undefined,
      page: params.get("page") || "1",
      pageSize: params.get("pageSize") || "20",
    }));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requirePermission(PERMISSIONS.DOCUMENTS_CREATE);
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) throw new DocumentError("INVALID", "A document file is required.");
    const document = await getDocumentService().create(actor, {
      title: formData.get("title") ?? file.name,
      category: formData.get("category") || null,
      recordType: formData.get("recordType"),
      recordId: formData.get("recordId"),
    }, file, request.headers.get("x-correlation-id") ?? undefined);
    return NextResponse.json(document, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
