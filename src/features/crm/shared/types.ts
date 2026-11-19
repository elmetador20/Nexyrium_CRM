import type { AuthorizationActor } from "@/lib/authorization/policy";
import { ROLE_SLUGS } from "@/lib/authorization/roles";

const globalCrmRoles = new Set<string>([ROLE_SLUGS.OWNER_ADMIN, ROLE_SLUGS.FOUNDER, ROLE_SLUGS.READ_ONLY_AUDITOR]);

export type CrmScope =
  | { kind: "global" }
  | { kind: "department"; departmentIds: string[] }
  | { kind: "owner"; userId: string };

export type CrmAuditWriter = (event: {
  actorUserId: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  outcome: "success" | "failure";
  metadata?: Record<string, unknown>;
}) => Promise<void>;

export function getCrmScope(actor: AuthorizationActor): CrmScope {
  if (actor.roles.some((role) => globalCrmRoles.has(role))) {
    return { kind: "global" };
  }

  if (actor.roles.includes(ROLE_SLUGS.DEPARTMENT_LEAD)) {
    return { kind: "department", departmentIds: actor.departmentIds };
  }

  return { kind: "owner", userId: actor.userId };
}

export function canAssignCrmRecord(actor: AuthorizationActor, ownerId: string | null, departmentId: string | null) {
  if (!ownerId || ownerId === actor.userId) {
    return true;
  }

  if (actor.roles.includes(ROLE_SLUGS.OWNER_ADMIN) || actor.roles.includes(ROLE_SLUGS.FOUNDER)) {
    return true;
  }

  return actor.roles.includes(ROLE_SLUGS.DEPARTMENT_LEAD) && Boolean(departmentId && actor.departmentIds.includes(departmentId));
}

export function normalizePage(page: number, pageSize: number) {
  return {
    page: Math.max(1, page),
    pageSize: Math.min(100, Math.max(1, pageSize)),
  };
}
