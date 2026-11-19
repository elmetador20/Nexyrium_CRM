import "server-only";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { auditLogs, roles, userRoles, users } from "@/db/schema";

import { AuthorizationError } from "./errors";
import { PERMISSIONS } from "./permissions";
import { can, type AuthorizationActor } from "./policy";

export const replaceRolesSchema = z.object({
  roleIds: z.array(z.string().uuid()).min(1).max(10),
});

export async function replaceUserRoles({
  actor,
  targetUserId,
  roleIds,
}: {
  actor: AuthorizationActor;
  targetUserId: string;
  roleIds: string[];
}) {
  if (!can(actor, PERMISSIONS.AUTH_ROLE_MANAGE)) {
    throw new AuthorizationError("FORBIDDEN", "You do not have permission to change roles.");
  }

  const uniqueRoleIds = [...new Set(roleIds)];
  const [targetUser] = await db.select({ id: users.id }).from(users).where(eq(users.id, targetUserId)).limit(1);

  if (!targetUser) {
    throw new AuthorizationError("RECORD_FORBIDDEN", "The target user does not exist.");
  }

  const existingRoles = await db.select({ id: roles.id }).from(roles);

  if (uniqueRoleIds.some((roleId) => !existingRoles.some((role) => role.id === roleId))) {
    throw new AuthorizationError("FORBIDDEN", "One or more requested roles are invalid.");
  }

  await db.transaction(async (tx) => {
    await tx.delete(userRoles).where(eq(userRoles.userId, targetUserId));
    await tx.insert(userRoles).values(uniqueRoleIds.map((roleId) => ({ userId: targetUserId, roleId })));
    await tx.insert(auditLogs).values({
      actorUserId: actor.userId,
      action: "authorization.user_roles.replace",
      resourceType: "user",
      resourceId: targetUserId,
      outcome: "success",
      metadata: { roleCount: uniqueRoleIds.length },
    });
  });
}
