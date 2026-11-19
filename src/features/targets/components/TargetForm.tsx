import "@/features/reports/components/workspace.css";
import { asc, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { ROLE_SLUGS } from "@/lib/authorization/roles";
import { db } from "@/db";
import { auditLogs, departments } from "@/db/schema";
import { requirePagePermission } from "@/lib/authorization/server";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { targetScope } from "../scope";
import { MonthlyTargetForm } from "./MonthlyTargetForm";

export async function TargetForm() {
  const actor = await requirePagePermission(PERMISSIONS.REPORTS_MANAGE);
  const scope = targetScope(actor);
  const rows = scope.kind === "owner" || (scope.kind === "department" && !scope.departmentIds.length) ? [] :
    await db.select({id:departments.id,name:departments.name}).from(departments)
    .where(scope.kind === "department" ? inArray(departments.id,scope.departmentIds) : undefined).orderBy(asc(departments.name));
  if (rows.length) return <MonthlyTargetForm departments={rows} />;
  if (!canSetUpDepartments(actor.roles)) {
    return <p>Ask an Owner/Admin to assign your account to Design or Technology, then refresh this page to set a target.</p>;
  }
  return <form action={setUpDepartments} className="space-y-3">
    <p>Create Nexyrium’s two departments to start setting monthly targets.</p>
    <button className="button-primary">Set up Design and Technology</button>
  </form>;
}

function canSetUpDepartments(roles: readonly string[]) {
  return roles.includes(ROLE_SLUGS.OWNER_ADMIN) || roles.includes(ROLE_SLUGS.FOUNDER);
}

async function setUpDepartments() {
  "use server";
  const actor = await requirePagePermission(PERMISSIONS.REPORTS_MANAGE);
  if (!canSetUpDepartments(actor.roles)) throw new Error("A Founder or Owner/Admin must set up departments.");
  await db.transaction(async tx => {
    const added = await tx.insert(departments).values([
      { name: "Design", slug: "design" },
      { name: "Technology", slug: "technology" },
    ]).onConflictDoNothing({ target: departments.slug }).returning({ id: departments.id, slug: departments.slug });
    for (const department of added) {
      await tx.insert(auditLogs).values({ actorUserId: actor.userId, action: "department.create", resourceType: "department", resourceId: department.id, outcome: "success", metadata: { slug: department.slug } });
    }
  });
  revalidatePath("/targets");
}
