import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { replaceRolesSchema, replaceUserRoles } from "@/lib/authorization/role-management";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const actor = await requirePermission(PERMISSIONS.AUTH_ROLE_MANAGE);
    const { userId } = await params;
    const { roleIds } = replaceRolesSchema.parse(await request.json());

    await replaceUserRoles({ actor, targetUserId: userId, roleIds });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid role assignment input.", code: "INVALID_INPUT" }, { status: 400 });
    }

    return authorizationErrorResponse(error);
  }
}
