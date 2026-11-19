import { eq, inArray, or, sql } from "drizzle-orm";

import { projects } from "@/db/schema";
import type { CrmScope } from "@/features/crm/shared/types";
import { can, canAccessRecord, type AuthorizationActor } from "@/lib/authorization/policy";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { ROLE_SLUGS } from "@/lib/authorization/roles";

export type ProjectAccess = CrmScope & { userId: string };

export function projectAccess(actor: AuthorizationActor): ProjectAccess {
  if (actor.roles.some((role) => [ROLE_SLUGS.OWNER_ADMIN, ROLE_SLUGS.FOUNDER, ROLE_SLUGS.READ_ONLY_AUDITOR].includes(role as never))) return { kind: "global", userId: actor.userId };
  if (actor.roles.includes(ROLE_SLUGS.DEPARTMENT_LEAD)) return { kind: "department", departmentIds: actor.departmentIds, userId: actor.userId };
  return { kind: "owner", userId: actor.userId };
}

export function projectVisibilityCondition(access: ProjectAccess) {
  const memberCondition = sql`exists (select 1 from project_members pm where pm.project_id = ${projects.id} and pm.user_id = ${access.userId})`;
  if (access.kind === "global") return undefined;
  if (access.kind === "owner") return or(eq(projects.ownerId, access.userId), memberCondition);
  return or(inArray(projects.departmentId, access.departmentIds), memberCondition);
}

export function canReadProject(actor: AuthorizationActor, project: { ownerId: string | null; departmentId: string | null }, isMember: boolean) {
  if (!can(actor, PERMISSIONS.PROJECTS_READ)) return false;
  if (actor.roles.some((role) => [ROLE_SLUGS.OWNER_ADMIN, ROLE_SLUGS.FOUNDER, ROLE_SLUGS.READ_ONLY_AUDITOR].includes(role as never))) return true;
  if (project.ownerId === actor.userId || isMember) return true;
  return Boolean(project.departmentId && actor.roles.includes(ROLE_SLUGS.DEPARTMENT_LEAD) && actor.departmentIds.includes(project.departmentId));
}

export function canManageProject(actor: AuthorizationActor, project: { ownerId: string | null; departmentId: string | null }) {
  if (!can(actor, PERMISSIONS.PROJECTS_UPDATE)) return false;
  if (actor.roles.some((role) => [ROLE_SLUGS.OWNER_ADMIN, ROLE_SLUGS.FOUNDER].includes(role as never))) return true;
  if (project.ownerId === actor.userId) return true;
  return Boolean(project.departmentId && actor.roles.includes(ROLE_SLUGS.DEPARTMENT_LEAD) && actor.departmentIds.includes(project.departmentId));
}

export function canManageMembers(actor: AuthorizationActor, project: { ownerId: string | null; departmentId: string | null }) {
  if (actor.roles.some((role) => [ROLE_SLUGS.OWNER_ADMIN, ROLE_SLUGS.FOUNDER].includes(role as never))) return true;
  if (project.ownerId === actor.userId && can(actor, PERMISSIONS.PROJECTS_UPDATE)) return true;
  if (!can(actor, PERMISSIONS.PROJECTS_MEMBERS_MANAGE)) return false;
  return Boolean(project.departmentId && actor.roles.includes(ROLE_SLUGS.DEPARTMENT_LEAD) && actor.departmentIds.includes(project.departmentId));
}

export function canAccessCrmRecord(actor: AuthorizationActor, permission: string, record: { ownerUserId: string | null; departmentId: string | null }) {
  const scope = projectAccess(actor);
  const scopeName = scope.kind === "global" ? "global" : scope.kind === "department" ? "department" : "owner";
  return canAccessRecord(actor, permission, record, scopeName);
}
