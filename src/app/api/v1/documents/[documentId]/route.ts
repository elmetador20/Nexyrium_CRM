import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { documentErrorResponse } from "@/features/documents/errors";
import { getDocumentService } from "@/features/documents/server";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";

function errorResponse(error: unknown) {
  if (error instanceof ZodError) return NextResponse.json({ error: "Invalid document input.", code: "INVALID_INPUT" }, { status: 400 });
  return documentErrorResponse(error) ?? authorizationErrorResponse(error);
}

export async function GET(_request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  try {
    const actor = await requirePermission(PERMISSIONS.DOCUMENTS_READ);
    const { documentId } = await params;
    return NextResponse.json(await getDocumentService().get(actor, documentId));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  try {
    const actor = await requirePermission(PERMISSIONS.DOCUMENTS_UPDATE);
    const { documentId } = await params;
    return NextResponse.json(await getDocumentService().update(actor, documentId, await request.json(), request.headers.get("x-correlation-id") ?? undefined));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  try {
    const actor = await requirePermission(PERMISSIONS.DOCUMENTS_DELETE);
    const { documentId } = await params;
    return NextResponse.json(await getDocumentService().archive(actor, documentId, request.headers.get("x-correlation-id") ?? undefined));
  } catch (error) {
    return errorResponse(error);
  }
}
