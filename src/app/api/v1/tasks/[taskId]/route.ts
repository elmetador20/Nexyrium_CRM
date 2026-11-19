import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getTaskService } from "@/features/tasks/server";
import { taskErrorResponse } from "@/features/tasks/errors";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";

export async function GET(_request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const actor = await requirePermission(PERMISSIONS.TASKS_READ);
    const { taskId } = await params;
    return NextResponse.json(await getTaskService().get(actor, taskId));
  } catch (error) { return taskErrorResponse(error) ?? authorizationErrorResponse(error); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const actor = await requirePermission(PERMISSIONS.TASKS_UPDATE);
    const { taskId } = await params;
    return NextResponse.json(await getTaskService().update(actor, taskId, await request.json(), request.headers.get("x-correlation-id") ?? undefined));
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid task input.", code: "INVALID_INPUT" }, { status: 400 });
    return taskErrorResponse(error) ?? authorizationErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const actor = await requirePermission(PERMISSIONS.TASKS_DELETE);
    const { taskId } = await params;
    return NextResponse.json(await getTaskService().archive(actor, taskId, request.headers.get("x-correlation-id") ?? undefined));
  } catch (error) { return taskErrorResponse(error) ?? authorizationErrorResponse(error); }
}
