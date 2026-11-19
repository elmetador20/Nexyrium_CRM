import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getProjectService } from "@/features/projects/server";
import { projectErrorResponse } from "@/features/projects/errors";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const actor = await requirePermission(PERMISSIONS.PROJECTS_UPDATE);
    const { projectId } = await params;
    return NextResponse.json(await getProjectService().transition(actor, projectId, await request.json(), request.headers.get("x-correlation-id") ?? undefined));
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid project transition.", code: "INVALID_INPUT" }, { status: 400 });
    return projectErrorResponse(error) ?? authorizationErrorResponse(error);
  }
}
