import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  peopleProfiles,
  permissions,
  rolePermissions,
  roles,
  userDepartments,
  userRoles,
  users,
} from "@/db/schema";
import type { AuthorizationActor } from "@/lib/authorization/policy";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function buildActor(user: typeof users.$inferSelect): Promise<AuthorizationActor> {
  const [roleRows, permissionRows, departmentRows] = await Promise.all([
    db
      .select({ slug: roles.slug })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, user.id)),
    db
      .select({ slug: permissions.slug })
      .from(userRoles)
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(eq(userRoles.userId, user.id)),
    db
      .select({ departmentId: userDepartments.departmentId })
      .from(userDepartments)
      .where(eq(userDepartments.userId, user.id)),
  ]);

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    isActive: user.isActive,
    roles: [...new Set(roleRows.map(({ slug }) => slug))],
    permissions: [...new Set(permissionRows.map(({ slug }) => slug))],
    departmentIds: [...new Set(departmentRows.map(({ departmentId }) => departmentId))],
  };
}

const eligibleAccount = sql`not exists (select 1 from ${peopleProfiles} where ${peopleProfiles.userId} = ${users.id} and ${peopleProfiles.employmentStatus} = 'terminated')`;

export async function getActiveActorById(userId: string): Promise<AuthorizationActor | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(and(eligibleAccount, eq(users.id, userId), eq(users.isActive, true)))
    .limit(1);

  return user ? buildActor(user) : null;
}

export async function getActiveActorByEmail(email: string): Promise<AuthorizationActor | null> {
  const normalizedEmail = normalizeEmail(email);
  const [user] = await db
    .select()
    .from(users)
    .where(and(eligibleAccount, eq(users.isActive, true), sql`lower(${users.email}) = ${normalizedEmail}`))
    .limit(1);

  return user ? buildActor(user) : null;
}

export { normalizeEmail };

/** Fills an empty display name from the Google profile. Never overwrites a name set in the directory. */
export async function fillMissingUserName(userId: string, googleName: string | null | undefined): Promise<void> {
  const name = googleName?.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 200);
  if (!name) return;
  await db.update(users).set({ name, updatedAt: new Date() }).where(and(eq(users.id, userId), sql`(${users.name} is null or btrim(${users.name}) = '')`));
}
