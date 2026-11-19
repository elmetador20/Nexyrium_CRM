import { and, eq, ne } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs, departmentTargets, departments } from "@/db/schema";
import type { AuthorizationActor } from "@/lib/authorization/policy";
import { can } from "@/lib/authorization/policy";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { TargetError } from "../errors";
import { targetScope } from "../scope";
import { targetCreateSchema, targetListSchema, targetUpdateSchema } from "../schemas";
import { getTarget, listTargets } from "../queries";

function validateMonth(periodStart: string, periodEnd: string) {
  const start = new Date(`${periodStart}T00:00:00.000Z`);
  const end = new Date(`${periodEnd}T00:00:00.000Z`);
  const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start.getUTCDate() !== 1 || periodStart.slice(0, 7) !== periodEnd.slice(0, 7) || periodEnd !== lastDay) throw new TargetError("INVALID", "Targets must cover one complete calendar month.");
}

function ensureDepartmentAccess(actor: AuthorizationActor, departmentId: string) {
  const scope = targetScope(actor);
  if (scope.kind === "department" && !scope.departmentIds.includes(departmentId)) throw new TargetError("FORBIDDEN", "You cannot manage another department's target.");
  if (scope.kind === "owner") throw new TargetError("FORBIDDEN", "You do not have department target access.");
}

export function createTargetService() {
  return {
    async list(actor: AuthorizationActor, rawInput: unknown) {
      if (!can(actor, PERMISSIONS.REPORTS_READ)) throw new TargetError("FORBIDDEN", "You cannot read departmental targets.");
      return listTargets(targetListSchema.parse(rawInput), targetScope(actor));
    },

    async create(actor: AuthorizationActor, rawInput: unknown, correlationId?: string) {
      if (!can(actor, PERMISSIONS.REPORTS_MANAGE)) throw new TargetError("FORBIDDEN", "You cannot manage departmental targets.");
      const input = targetCreateSchema.parse(rawInput);
      ensureDepartmentAccess(actor, input.departmentId);
      validateMonth(input.periodStart, input.periodEnd);
      const [department] = await db.select({ id: departments.id }).from(departments).where(eq(departments.id, input.departmentId)).limit(1);
      if (!department) throw new TargetError("NOT_FOUND", "Department not found.");
      const [existing] = await db.select({ id: departmentTargets.id }).from(departmentTargets).where(and(eq(departmentTargets.departmentId, input.departmentId), eq(departmentTargets.metricKey, input.metricKey), eq(departmentTargets.periodStart, input.periodStart), eq(departmentTargets.periodEnd, input.periodEnd))).limit(1);
      if (existing) throw new TargetError("CONFLICT", "A target already exists for this department, metric, and month.");
      const [target] = await db.transaction(async (tx) => {
        const [created] = await tx.insert(departmentTargets).values({ departmentId: input.departmentId, metricKey: input.metricKey, periodStart: input.periodStart, periodEnd: input.periodEnd, unit: input.unit, targetCount: input.targetCount ?? null, targetMinor: input.targetMinor ?? null, currencyCode: input.currencyCode ?? null, createdByUserId: actor.userId, updatedByUserId: actor.userId }).returning();
        if (!created) throw new TargetError("INVALID", "Department target could not be created.");
        await tx.insert(auditLogs).values({ actorUserId: actor.userId, action: "target.create", resourceType: "department_target", resourceId: created.id, outcome: "success", correlationId: correlationId ?? null, metadata: { departmentId: created.departmentId, metricKey: created.metricKey, periodStart: created.periodStart, periodEnd: created.periodEnd, unit: created.unit } });
        return [created] as const;
      });
      return target;
    },

    async update(actor: AuthorizationActor, id: string, rawInput: unknown, correlationId?: string) {
      if (!can(actor, PERMISSIONS.REPORTS_MANAGE)) throw new TargetError("FORBIDDEN", "You cannot manage departmental targets.");
      const input = targetUpdateSchema.parse(rawInput);
      const current = await getTarget(id);
      if (!current) throw new TargetError("NOT_FOUND", "Department target not found.");
      ensureDepartmentAccess(actor, current.departmentId);
      const periodStart = input.periodStart ?? current.periodStart;
      const periodEnd = input.periodEnd ?? current.periodEnd;
      validateMonth(periodStart, periodEnd);
      const metricKey = input.metricKey ?? current.metricKey;
      if (periodStart !== current.periodStart || periodEnd !== current.periodEnd || metricKey !== current.metricKey) {
        const [duplicate] = await db.select({ id: departmentTargets.id }).from(departmentTargets).where(and(eq(departmentTargets.departmentId, current.departmentId), eq(departmentTargets.metricKey, metricKey), eq(departmentTargets.periodStart, periodStart), eq(departmentTargets.periodEnd, periodEnd), ne(departmentTargets.id, id))).limit(1);
        if (duplicate) throw new TargetError("CONFLICT", "A target already exists for this department, metric, and month.");
      }
      const [updated] = await db.transaction(async (tx) => {
        const [record] = await tx.update(departmentTargets).set({ metricKey, periodStart, periodEnd, unit: input.unit, targetCount: input.targetCount ?? null, targetMinor: input.targetMinor ?? null, currencyCode: input.currencyCode ?? null, updatedByUserId: actor.userId, updatedAt: new Date() }).where(eq(departmentTargets.id, id)).returning();
        if (!record) throw new TargetError("NOT_FOUND", "Department target not found.");
        await tx.insert(auditLogs).values({ actorUserId: actor.userId, action: "target.update", resourceType: "department_target", resourceId: id, outcome: "success", correlationId: correlationId ?? null, metadata: { changedFields: Object.keys(input), metricKey: record.metricKey, periodStart: record.periodStart, periodEnd: record.periodEnd } });
        return [record] as const;
      });
      return updated;
    },
  };
}
