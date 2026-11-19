import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getTaskService } from "@/features/tasks/server";
import { taskErrorResponse } from "@/features/tasks/errors";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";

export async function POST(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const actor = await requirePermission(PERMISSIONS.TASKS_UPDATE);
    const { taskId } = await params;
    return NextResponse.json(await getTaskService().transition(actor, taskId, await request.json(), request.headers.get("x-correlation-id") ?? undefined));
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid task transition.", code: "INVALID_INPUT" }, { status: 400 });
    return taskErrorResponse(error) ?? authorizationErrorResponse(error);
  }
}
