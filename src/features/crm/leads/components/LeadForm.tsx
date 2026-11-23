import { db } from "@/db";
import { sql } from "drizzle-orm";
import { ROLE_SLUGS } from "@/lib/authorization/roles";
import type { ComponentProps } from "react";
import { requirePageActor } from "@/lib/authorization/server";
import { workspaceDepartments } from "../../shared/departments";
import { LeadFields } from "./LeadFields";

export async function LeadForm(props: Omit<ComponentProps<typeof LeadFields>, "departments" | "salespeople">) {
  const actor = await requirePageActor();
  const global = actor.roles.some(role => role === ROLE_SLUGS.OWNER_ADMIN || role === ROLE_SLUGS.FOUNDER);
  const salespeople = global || actor.roles.includes(ROLE_SLUGS.DEPARTMENT_LEAD) ? (await db.execute<{id:string;name:string}>(sql`
    select u.id,coalesce(u.name,u.email) as name from users u where u.is_active
    and exists(select 1 from user_roles ur join roles r on r.id=ur.role_id where ur.user_id=u.id and r.slug=${ROLE_SLUGS.SALES})
    and not exists(select 1 from people_profiles p where p.user_id=u.id and p.employment_status='terminated')
    and (${global} or exists(select 1 from user_departments employee join user_departments manager using(department_id)
      where employee.user_id=u.id and manager.user_id=${actor.userId}::uuid)) order by name
  `)).rows : [];
  return <LeadFields salespeople={salespeople} {...props} departments={await workspaceDepartments(actor)}/>;
}
