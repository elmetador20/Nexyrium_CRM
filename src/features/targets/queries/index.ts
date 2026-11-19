import { and, eq, getTableColumns, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { departments, departmentTargets } from "@/db/schema";
import type { TargetListInput } from "../schemas";

export type TargetScope = { kind: "global"; userId: string } | { kind: "department"; departmentIds: string[]; userId: string } | { kind: "owner"; userId: string };

function scopeCondition(scope: TargetScope) {
  if (scope.kind === "global") return undefined;
  if (scope.kind === "department") return scope.departmentIds.length ? inArray(departmentTargets.departmentId, scope.departmentIds) : sql`false`;
  return sql`false`;
}

export async function listTargets(input: TargetListInput, scope: TargetScope) {
  return db.select({...getTableColumns(departmentTargets), departmentName: departments.name}).from(departmentTargets).innerJoin(departments,eq(departments.id,departmentTargets.departmentId)).where(and(scopeCondition(scope), input.departmentId ? eq(departmentTargets.departmentId, input.departmentId) : undefined, input.periodStart ? eq(departmentTargets.periodStart, input.periodStart) : undefined, input.periodEnd ? eq(departmentTargets.periodEnd, input.periodEnd) : undefined)).orderBy(departmentTargets.periodStart, departmentTargets.departmentId, departmentTargets.metricKey);
}

export async function getTarget(id: string) {
  const [target] = await db.select().from(departmentTargets).where(eq(departmentTargets.id, id)).limit(1);
  return target ?? null;
}
