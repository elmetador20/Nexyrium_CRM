import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { projectErrorResponse } from "@/features/projects/errors";
import { getProjectService } from "@/features/projects/server";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";

function errorResponse(error: unknown) {
  if (error instanceof ZodError) return NextResponse.json({ error: "Invalid project input.", code: "INVALID_INPUT" }, { status: 400 });
  return projectErrorResponse(error) ?? authorizationErrorResponse(error);
}

export async function GET(request: Request) {
  try {
    const actor = await requirePermission(PERMISSIONS.PROJECTS_READ);
    const params = new URL(request.url).searchParams;
    return NextResponse.json(await getProjectService().list(actor, Object.fromEntries(params.entries())));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requirePermission(PERMISSIONS.PROJECTS_CREATE);
    return NextResponse.json(await getProjectService().create(actor, await request.json(), request.headers.get("x-correlation-id") ?? undefined), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
