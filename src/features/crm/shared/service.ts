import { can } from "@/lib/authorization/policy";
import type { AuthorizationActor } from "@/lib/authorization/policy";
import type { Permission } from "@/lib/authorization/permissions";

import { CrmError } from "./errors";
import { ROLE_SLUGS } from "@/lib/authorization/roles";

const privilegedCrmRoles = new Set<string>([ROLE_SLUGS.OWNER_ADMIN, ROLE_SLUGS.FOUNDER]);

export function requireCrmPermission(actor: AuthorizationActor, permission: Permission) {
  if (!can(actor, permission)) {
    throw new CrmError("FORBIDDEN", "You do not have permission for this CRM action.");
  }
}

export function resolveCrmAssignment(
  actor: AuthorizationActor,
  ownerId: string | null | undefined,
  departmentId: string | null | undefined,
) {
  const resolvedOwnerId = ownerId ?? actor.userId;
  const resolvedDepartmentId = departmentId ?? actor.departmentIds[0] ?? null;
  const privileged = actor.roles.some((role) => privilegedCrmRoles.has(role));

  if (!privileged && resolvedOwnerId !== actor.userId && !actor.roles.includes(ROLE_SLUGS.DEPARTMENT_LEAD)) {
    throw new CrmError("FORBIDDEN", "You cannot assign CRM ownership to another user.");
  }

  if (!privileged && resolvedDepartmentId && !actor.departmentIds.includes(resolvedDepartmentId)) {
    throw new CrmError("FORBIDDEN", "You cannot assign a CRM record to another department.");
  }

  return { ownerId: resolvedOwnerId, departmentId: resolvedDepartmentId };
}

export function requireNonEmptyPatch(input: object) {
  if (Object.keys(input).length === 0) {
    throw new CrmError("INVALID", "At least one field must be changed.");
  }
}
