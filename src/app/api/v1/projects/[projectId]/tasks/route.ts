import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getTaskService } from "@/features/tasks/server";
import { taskErrorResponse } from "@/features/tasks/errors";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const actor = await requirePermission(PERMISSIONS.TASKS_READ);
    const { projectId } = await params;
    const searchParams = new URL(request.url).searchParams;
    return NextResponse.json(await getTaskService().list(actor, { ...Object.fromEntries(searchParams.entries()), projectId }));
  } catch (error) { return taskErrorResponse(error) ?? authorizationErrorResponse(error); }
}

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const actor = await requirePermission(PERMISSIONS.TASKS_CREATE);
    const { projectId } = await params;
    return NextResponse.json(await getTaskService().create(actor, projectId, await request.json(), request.headers.get("x-correlation-id") ?? undefined), { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid task input.", code: "INVALID_INPUT" }, { status: 400 });
    return taskErrorResponse(error) ?? authorizationErrorResponse(error);
  }
}
