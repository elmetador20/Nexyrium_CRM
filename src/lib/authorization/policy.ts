import { ROLE_SLUGS } from "./roles";
import type { Permission } from "./permissions";

export type AuthorizationActor = {
  userId: string;
  email: string;
  name: string | null;
  image?: string | null;
  isActive: boolean;
  roles: string[];
  permissions: string[];
  departmentIds: string[];
};

export type RecordScope = "global" | "department" | "owner";

export type ScopedRecord = {
  ownerUserId?: string | null;
  departmentId?: string | null;
};

const globalRoles = new Set<string>([
  ROLE_SLUGS.OWNER_ADMIN,
  ROLE_SLUGS.FOUNDER,
  ROLE_SLUGS.READ_ONLY_AUDITOR,
]);

const privilegedRoles = new Set<string>([ROLE_SLUGS.OWNER_ADMIN, ROLE_SLUGS.FOUNDER]);

export function hasRole(actor: AuthorizationActor | null, role: string): boolean {
  return Boolean(actor?.roles.includes(role));
}

export function hasPermission(actor: AuthorizationActor | null, permission: Permission | string): boolean {
  return Boolean(actor && (actor.permissions.includes("*") || actor.permissions.includes(permission)));
}

export function can(actor: AuthorizationActor | null, permission: Permission | string): boolean {
  return Boolean(
    actor?.isActive &&
      (actor.roles.some((role) => privilegedRoles.has(role)) || hasPermission(actor, permission)),
  );
}

export function canAccessRecord(
  actor: AuthorizationActor | null,
  permission: Permission | string,
  record: ScopedRecord,
  scope: RecordScope = "owner",
): boolean {
  if (!can(actor, permission)) {
    return false;
  }

  if (actor && (scope === "global" || actor.roles.some((role) => globalRoles.has(role)))) {
    return true;
  }

  if (!actor) {
    return false;
  }

  if (scope === "department") {
    return Boolean(record.departmentId && actor.departmentIds.includes(record.departmentId));
  }

  return record.ownerUserId === actor.userId;
}
