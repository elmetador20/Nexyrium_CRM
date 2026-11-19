import type { AuthorizationActor } from "@/lib/authorization/policy";
import { ROLE_SLUGS } from "@/lib/authorization/roles";

export function peopleScope(actor: AuthorizationActor) {
  if (actor.roles.some((role) => [ROLE_SLUGS.OWNER_ADMIN, ROLE_SLUGS.FOUNDER, ROLE_SLUGS.PEOPLE_HR, ROLE_SLUGS.READ_ONLY_AUDITOR].includes(role as never))) return { kind: "global" as const, userId: actor.userId };
  if (actor.roles.includes(ROLE_SLUGS.DEPARTMENT_LEAD)) return { kind: "department" as const, departmentIds: actor.departmentIds, userId: actor.userId };
  return { kind: "owner" as const, userId: actor.userId };
}
