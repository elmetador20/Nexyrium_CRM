import { asc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { departments } from "@/db/schema";
import type { AuthorizationActor } from "@/lib/authorization/policy";
import { getCrmScope } from "./types";

export async function workspaceDepartments(actor: AuthorizationActor) {
  const global = getCrmScope(actor).kind === "global";
  if (!global && !actor.departmentIds.length) return [];
  return db.select({id:departments.id,name:departments.name}).from(departments)
    .where(global ? undefined : inArray(departments.id,actor.departmentIds)).orderBy(asc(departments.name));
}
