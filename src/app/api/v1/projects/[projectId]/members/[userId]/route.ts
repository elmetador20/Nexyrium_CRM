import { NextResponse } from "next/server";

import { getProjectService } from "@/features/projects/server";
import { projectErrorResponse } from "@/features/projects/errors";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";

export async function DELETE(request: Request, { params }: { params: Promise<{ projectId: string; userId: string }> }) {
  try {
    const actor = await requirePermission(PERMISSIONS.PROJECTS_UPDATE);
    const { projectId, userId } = await params;
    return NextResponse.json(await getProjectService().removeMember(actor, projectId, userId, request.headers.get("x-correlation-id") ?? undefined));
  } catch (error) { return projectErrorResponse(error) ?? authorizationErrorResponse(error); }
}
