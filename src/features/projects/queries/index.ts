import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { clients, deals, projectActivities, projectMembers, projects, userDepartments, users } from "@/db/schema";
import type { CrmScope } from "@/features/crm/shared/types";

import type { ProjectListInput } from "../schemas";
import type { ProjectAccess } from "../scope";

export type ProjectRepository = {
  list(input: ProjectListInput, access: ProjectAccess): Promise<{ items: Array<typeof projects.$inferSelect>; total: number }>;
  findById(id: string, access: ProjectAccess): Promise<typeof projects.$inferSelect | null>;
  findByIdForMutation(id: string): Promise<typeof projects.$inferSelect | null>;
  findClient(id: string, scope: CrmScope): Promise<{ id: string; ownerId: string | null; departmentId: string | null; archivedAt: Date | null } | null>;
  findDeal(id: string, scope: CrmScope): Promise<{ id: string; clientId: string | null; ownerId: string | null; departmentId: string | null; archivedAt: Date | null } | null>;
  findActiveUser(id: string): Promise<{ id: string; name: string | null; email: string; isActive: boolean } | null>;
  isUserInDepartment(userId: string, departmentId: string): Promise<boolean>;
  create(input: typeof projects.$inferInsert): Promise<typeof projects.$inferSelect>;
  update(id: string, input: Partial<typeof projects.$inferInsert>): Promise<typeof projects.$inferSelect>;
  archive(id: string): Promise<typeof projects.$inferSelect | null>;
  listMembers(projectId: string): Promise<Array<{ userId: string; name: string | null; email: string; createdAt: Date }>>;
  isMember(projectId: string, userId: string): Promise<boolean>;
  addMember(input: typeof projectMembers.$inferInsert): Promise<void>;
  removeMember(projectId: string, userId: string): Promise<void>;
  addActivity(input: typeof projectActivities.$inferInsert): Promise<typeof projectActivities.$inferSelect>;
  listActivities(projectId: string): Promise<Array<typeof projectActivities.$inferSelect>>;
};

function accessCondition(access: ProjectAccess) {
  const member = sql`exists (select 1 from project_members pm where pm.project_id = ${projects.id} and pm.user_id = ${access.userId})`;
  if (access.kind === "global") return undefined;
  if (access.kind === "owner") return or(eq(projects.ownerId, access.userId), member);
  return or(inArray(projects.departmentId, access.departmentIds), member);
}

function listWhere(input: ProjectListInput, access: ProjectAccess) {
  const search = input.search ? `%${input.search}%` : undefined;
  return and(
    isNull(projects.archivedAt),
    accessCondition(access),
    input.status ? eq(projects.status, input.status) : undefined,
    input.clientId ? eq(projects.clientId, input.clientId) : undefined,
    input.dealId ? eq(projects.dealId, input.dealId) : undefined,
    input.ownerId ? eq(projects.ownerId, input.ownerId) : undefined,
    search ? or(ilike(projects.name, search), ilike(projects.description, search)) : undefined,
  );
}

export const projectRepository: ProjectRepository = {
  async list(input, access) {
    const where = listWhere(input, access);
    const offset = (input.page - 1) * input.pageSize;
    const [items, [{ total }]] = await Promise.all([
      db.select().from(projects).where(where).orderBy(desc(projects.createdAt), desc(projects.id)).limit(input.pageSize).offset(offset),
      db.select({ total: count() }).from(projects).where(where),
    ]);
    return { items, total: Number(total) };
  },
  async findById(id, access) {
    const [project] = await db.select().from(projects).where(and(eq(projects.id, id), isNull(projects.archivedAt), accessCondition(access))).limit(1);
    return project ?? null;
  },
  async findByIdForMutation(id) {
    const [project] = await db.select().from(projects).where(and(eq(projects.id, id), isNull(projects.archivedAt))).limit(1);
    return project ?? null;
  },
  async findClient(id, scope) {
    const condition = scope.kind === "global" ? undefined : scope.kind === "owner" ? eq(clients.ownerId, scope.userId) : scope.departmentIds.length ? inArray(clients.departmentId, scope.departmentIds) : sql`false`;
    const [client] = await db.select({ id: clients.id, ownerId: clients.ownerId, departmentId: clients.departmentId, archivedAt: clients.archivedAt }).from(clients).where(and(eq(clients.id, id), isNull(clients.archivedAt), condition)).limit(1);
    return client ?? null;
  },
  async findDeal(id, scope) {
    const condition = scope.kind === "global" ? undefined : scope.kind === "owner" ? eq(deals.ownerId, scope.userId) : scope.departmentIds.length ? inArray(deals.departmentId, scope.departmentIds) : sql`false`;
    const [deal] = await db.select({ id: deals.id, clientId: deals.clientId, ownerId: deals.ownerId, departmentId: deals.departmentId, archivedAt: deals.archivedAt }).from(deals).where(and(eq(deals.id, id), isNull(deals.archivedAt), condition)).limit(1);
    return deal ?? null;
  },
  async findActiveUser(id) {
    const [user] = await db.select({ id: users.id, name: users.name, email: users.email, isActive: users.isActive }).from(users).where(eq(users.id, id)).limit(1);
    return user ?? null;
  },
  async isUserInDepartment(userId, departmentId) {
    const [membership] = await db.select({ userId: userDepartments.userId }).from(userDepartments).where(and(eq(userDepartments.userId, userId), eq(userDepartments.departmentId, departmentId))).limit(1);
    return Boolean(membership);
  },
  async create(input) {
    const [project] = await db.insert(projects).values(input).returning();
    if (!project) throw new Error("Project insert did not return a record");
    return project;
  },
  async update(id, input) {
    const [project] = await db.update(projects).set({ ...input, updatedAt: new Date() }).where(eq(projects.id, id)).returning();
    if (!project) throw new Error("Project update did not return a record");
    return project;
  },
  async archive(id) {
    const [project] = await db.update(projects).set({ archivedAt: new Date(), updatedAt: new Date() }).where(and(eq(projects.id, id), isNull(projects.archivedAt))).returning();
    return project ?? null;
  },
  async listMembers(projectId) {
    return db.select({ userId: users.id, name: users.name, email: users.email, createdAt: projectMembers.createdAt }).from(projectMembers).innerJoin(users, eq(users.id, projectMembers.userId)).where(eq(projectMembers.projectId, projectId)).orderBy(asc(users.name), asc(users.email));
  },
  async isMember(projectId, userId) {
    const [member] = await db.select({ userId: projectMembers.userId }).from(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId))).limit(1);
    return Boolean(member);
  },
  async addMember(input) {
    await db.insert(projectMembers).values(input).onConflictDoNothing();
  },
  async removeMember(projectId, userId) {
    await db.delete(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
  },
  async addActivity(input) {
    const [activity] = await db.insert(projectActivities).values(input).returning();
    if (!activity) throw new Error("Project activity insert did not return a record");
    return activity;
  },
  async listActivities(projectId) {
    return db.select().from(projectActivities).where(eq(projectActivities.projectId, projectId)).orderBy(desc(projectActivities.createdAt), desc(projectActivities.id));
  },
};
