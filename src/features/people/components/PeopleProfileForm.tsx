import { asc,eq,inArray } from "drizzle-orm";
import { db } from "@/db";
import { departments, users, userDepartments } from "@/db/schema";
import { peopleScope } from "../scope";
import { requirePagePermission } from "@/lib/authorization/server";
import { can } from "@/lib/authorization/policy";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { peopleService } from "../server";
import { EditablePeopleProfile } from "./EditablePeopleProfile";

export async function PeopleProfileForm(props: {
  userId: string;
  initial: { jobTitle: string | null; employmentStatus: string; managerUserId: string | null; departmentIds: string[] };
}) {
  const actor = await requirePagePermission(PERMISSIONS.PEOPLE_MANAGE);
  const person = await peopleService.get(actor, props.userId);
  if (!person.isActive) return <p className="mt-4">Workspace access removed.</p>;
  const protectedRole = person.roles.some(role => ["owner_admin", "founder"].includes(role.slug));
  const canRemove = actor.userId !== person.id && can(actor, PERMISSIONS.AUTH_ROLE_MANAGE)
    && (!protectedRole || actor.roles.includes("owner_admin"));
  const scope=peopleScope(actor);
  const teams=scope.kind==="global" ? await db.select({id:departments.id,name:departments.name}).from(departments).orderBy(asc(departments.name)) : actor.departmentIds.length ? await db.select({id:departments.id,name:departments.name}).from(departments).where(inArray(departments.id,actor.departmentIds)) : [];
  const options=scope.kind==="global" ? await db.select({id:users.id,name:users.name,email:users.email}).from(users).where(eq(users.isActive,true)).orderBy(asc(users.name)) : scope.kind==="department" && actor.departmentIds.length ? await db.selectDistinct({id:users.id,name:users.name,email:users.email}).from(users).innerJoin(userDepartments,eq(users.id,userDepartments.userId)).where(inArray(userDepartments.departmentId,actor.departmentIds)) : [];
  const managers=options.filter(m=>m.id!==props.userId).map(m=>({id:m.id,name:m.name||m.email}));
  if(person.manager && !managers.some(m=>m.id===person.manager!.id)) managers.push({id:person.manager.id,name:person.manager.name||person.manager.email});
  for(const assigned of person.departments) if(!teams.some(t=>t.id===assigned.id)) teams.push({id:assigned.id,name:assigned.name});
  return <EditablePeopleProfile managers={managers} teams={teams} {...props} name={person.name ?? ""} canRemove={canRemove}/>;
}
