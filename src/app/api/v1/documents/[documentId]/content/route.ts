import { NextResponse } from "next/server";

import { documentErrorResponse } from "@/features/documents/errors";
import { getDocumentService } from "@/features/documents/server";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";

export async function GET(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  try {
    const actor = await requirePermission(PERMISSIONS.DOCUMENTS_READ);
    const { documentId } = await params;
    const file = await getDocumentService().download(actor, documentId, request.headers.get("x-correlation-id") ?? undefined);
    return new NextResponse(file.body as unknown as BodyInit, {
      status: 200,
      headers: {
        "content-type": file.mimeType,
        "content-length": String(file.sizeBytes),
        "content-disposition": `attachment; filename="${file.filename.replace(/"/g, "_")}"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return documentErrorResponse(error) ?? authorizationErrorResponse(error);
  }
}
