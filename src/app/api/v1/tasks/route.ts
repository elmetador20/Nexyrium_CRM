import { NextResponse } from "next/server";

import { getTaskService } from "@/features/tasks/server";
import { taskErrorResponse } from "@/features/tasks/errors";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";

export async function GET(request: Request) {
  try {
    const actor = await requirePermission(PERMISSIONS.TASKS_READ);
    return NextResponse.json(await getTaskService().list(actor, Object.fromEntries(new URL(request.url).searchParams.entries())));
  } catch (error) { return taskErrorResponse(error) ?? authorizationErrorResponse(error); }
}
