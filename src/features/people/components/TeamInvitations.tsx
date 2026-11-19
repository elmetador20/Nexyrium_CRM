import "@/features/reports/components/workspace.css";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { departments, roles } from "@/db/schema";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { can, type AuthorizationActor } from "@/lib/authorization/policy";
import { InvitationForm } from "./InvitationForm";

export async function TeamInvitations({ actor }: { actor: AuthorizationActor }) {
  if (!can(actor, PERMISSIONS.AUTH_INVITE)) return null;
  const [roleOptions, departmentOptions] = await Promise.all([
    db.select({id: roles.id, name: roles.name, slug: roles.slug}).from(roles).orderBy(asc(roles.name)),
    db.select({id: departments.id, name: departments.name}).from(departments).orderBy(asc(departments.name)),
  ]);
  const allowed = roleOptions.filter(role => can(actor, PERMISSIONS.AUTH_ROLE_MANAGE) || !["owner_admin","founder"].includes(role.slug));
  return <details className="panel my-4" id="invite-teammate"><summary className="cursor-pointer font-semibold">Invite teammate</summary><InvitationForm roles={allowed} departments={departmentOptions}/></details>;
}
