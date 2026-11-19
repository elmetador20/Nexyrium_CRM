import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getProjectService } from "@/features/projects/server";
import { projectErrorResponse } from "@/features/projects/errors";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";

function errorResponse(error: unknown) {
  if (error instanceof ZodError) return NextResponse.json({ error: "Invalid project input.", code: "INVALID_INPUT" }, { status: 400 });
  return projectErrorResponse(error) ?? authorizationErrorResponse(error);
}

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const actor = await requirePermission(PERMISSIONS.PROJECTS_READ);
    const { projectId } = await params;
    return NextResponse.json(await getProjectService().get(actor, projectId));
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const actor = await requirePermission(PERMISSIONS.PROJECTS_UPDATE);
    const { projectId } = await params;
    return NextResponse.json(await getProjectService().update(actor, projectId, await request.json(), request.headers.get("x-correlation-id") ?? undefined));
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const actor = await requirePermission(PERMISSIONS.PROJECTS_DELETE);
    const { projectId } = await params;
    return NextResponse.json(await getProjectService().archive(actor, projectId, request.headers.get("x-correlation-id") ?? undefined));
  } catch (error) { return errorResponse(error); }
}
