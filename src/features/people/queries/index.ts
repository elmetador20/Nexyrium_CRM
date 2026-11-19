import { and, count, eq, ilike, inArray, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { departments, peopleProfiles, roles, userDepartments, userRoles, users } from "@/db/schema";
import type { PeopleListInput } from "../schemas";

export type PeopleScope = { kind: "global"; userId: string } | { kind: "department"; departmentIds: string[]; userId: string } | { kind: "owner"; userId: string };

function scopeCondition(scope: PeopleScope) {
  if (scope.kind === "global") return undefined;
  if (scope.kind === "owner") return eq(users.id, scope.userId);
  return sql`exists (select 1 from user_departments people_scope_ud where people_scope_ud.user_id = ${users.id} and people_scope_ud.department_id = any(${scope.departmentIds}))`;
}

function listCondition(input: PeopleListInput, scope: PeopleScope) {
  const search = input.search ? `%${input.search}%` : undefined;
  return and(scopeCondition(scope), input.includeInactive ? undefined : eq(users.isActive, true), search ? or(ilike(users.name, search), ilike(users.email, search), ilike(peopleProfiles.jobTitle, search)) : undefined);
}

async function attachAssociations(records: Array<{ user: typeof users.$inferSelect; profile: typeof peopleProfiles.$inferSelect | null }>) {
  const ids = records.map((record) => record.user.id);
  if (!ids.length) return [];
  const managerIds = [...new Set(records.map((record) => record.profile?.managerUserId).filter((id): id is string => Boolean(id)))];
  const [roleRows, departmentRows, managerRows] = await Promise.all([
    db.select({ userId: userRoles.userId, id: roles.id, name: roles.name, slug: roles.slug }).from(userRoles).innerJoin(roles, eq(roles.id, userRoles.roleId)).where(inArray(userRoles.userId, ids)),
    db.select({ userId: userDepartments.userId, id: departments.id, name: departments.name, slug: departments.slug, isPrimary: userDepartments.isPrimary }).from(userDepartments).innerJoin(departments, eq(departments.id, userDepartments.departmentId)).where(inArray(userDepartments.userId, ids)),
    managerIds.length ? db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, managerIds)) : Promise.resolve([]),
  ]);
  return records.map(({ user, profile }) => ({ id: user.id, name: user.name, email: user.email, isActive: user.isActive, createdAt: user.createdAt, updatedAt: user.updatedAt, profile: profile ? { jobTitle: profile.jobTitle, employmentStatus: profile.employmentStatus, managerUserId: profile.managerUserId, updatedAt: profile.updatedAt } : { jobTitle: null, employmentStatus: "active" as const, managerUserId: null, updatedAt: user.updatedAt }, roles: roleRows.filter((role) => role.userId === user.id).map((role) => ({ id: role.id, name: role.name, slug: role.slug })), departments: departmentRows.filter((department) => department.userId === user.id).map((department) => ({ id: department.id, name: department.name, slug: department.slug, isPrimary: department.isPrimary })), manager: managerRows.find((manager) => manager.id === profile?.managerUserId) ?? null }));
}

export async function listPeople(input: PeopleListInput, scope: PeopleScope) {
  const where = listCondition(input, scope);
  const offset = (input.page - 1) * input.pageSize;
  const [rows, [{ total }]] = await Promise.all([
    db.select({ user: users, profile: peopleProfiles }).from(users).leftJoin(peopleProfiles, eq(peopleProfiles.userId, users.id)).where(where).orderBy(users.name, users.email).limit(input.pageSize).offset(offset),
    db.select({ total: count() }).from(users).leftJoin(peopleProfiles, eq(peopleProfiles.userId, users.id)).where(where),
  ]);
  return { items: await attachAssociations(rows), total: Number(total) };
}

export async function getPerson(id: string, scope: PeopleScope) {
  const [row] = await db.select({ user: users, profile: peopleProfiles }).from(users).leftJoin(peopleProfiles, eq(peopleProfiles.userId, users.id)).where(and(eq(users.id, id), scopeCondition(scope))).limit(1);
  if (!row) return null;
  return (await attachAssociations([row]))[0] ?? null;
}

export async function findUser(id: string) {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user ?? null;
}
