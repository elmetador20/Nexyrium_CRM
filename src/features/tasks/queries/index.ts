import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { projectMembers, projects, tasks, users } from "@/db/schema";
import type { TaskListInput } from "../schemas";
import type { ProjectAccess } from "@/features/projects/scope";

export type TaskRepository = {
  list(input: TaskListInput, access: ProjectAccess): Promise<{ items: Array<typeof tasks.$inferSelect>; total: number }>;
  findById(id: string, access: ProjectAccess): Promise<typeof tasks.$inferSelect | null>;
  findByIdForMutation(id: string): Promise<typeof tasks.$inferSelect | null>;
  findProject(projectId: string, access: ProjectAccess): Promise<typeof projects.$inferSelect | null>;
  isProjectMember(projectId: string, userId: string): Promise<boolean>;
  findActiveUser(userId: string): Promise<{ id: string; name: string | null; email: string; isActive: boolean } | null>;
  create(input: typeof tasks.$inferInsert): Promise<typeof tasks.$inferSelect>;
  update(id: string, input: Partial<typeof tasks.$inferInsert>): Promise<typeof tasks.$inferSelect>;
  archive(id: string): Promise<typeof tasks.$inferSelect | null>;
  countOpen(projectId: string): Promise<number>;
  countOpenAssigned(projectId: string, userId: string): Promise<number>;
};

function accessCondition(access: ProjectAccess) {
  const member = sql`exists (select 1 from project_members pm where pm.project_id = ${projects.id} and pm.user_id = ${access.userId})`;
  if (access.kind === "global") return undefined;
  if (access.kind === "owner") return or(eq(projects.ownerId, access.userId), member);
  return or(inArray(projects.departmentId, access.departmentIds), member);
}

function listWhere(input: TaskListInput, access: ProjectAccess) {
  const search = input.search ? `%${input.search}%` : undefined;
  const dueBefore = input.dueBefore ? input.dueBefore.toISOString().slice(0, 10) : undefined;
  const dueAfter = input.dueAfter ? input.dueAfter.toISOString().slice(0, 10) : undefined;
  return and(
    isNull(tasks.archivedAt),
    isNull(projects.archivedAt),
    accessCondition(access),
    input.projectId ? eq(tasks.projectId, input.projectId) : undefined,
    input.status ? eq(tasks.status, input.status) : undefined,
    input.priority ? eq(tasks.priority, input.priority) : undefined,
    input.assigneeId ? eq(tasks.assigneeId, input.assigneeId) : undefined,
    dueBefore ? sql`${tasks.dueDate} <= ${dueBefore}` : undefined,
    dueAfter ? sql`${tasks.dueDate} >= ${dueAfter}` : undefined,
    search ? or(ilike(tasks.title, search), ilike(tasks.description, search)) : undefined,
  );
}

function orderBy(input: TaskListInput) {
  const direction = input.direction === "asc" ? asc : desc;
  if (input.sort === "due") return [direction(tasks.dueDate), direction(tasks.id)] as const;
  if (input.sort === "priority") return [direction(tasks.priority), direction(tasks.id)] as const;
  if (input.sort === "status") return [direction(tasks.status), direction(tasks.id)] as const;
  return [direction(tasks.createdAt), direction(tasks.id)] as const;
}

export const taskRepository: TaskRepository = {
  async list(input, access) {
    const where = listWhere(input, access);
    const offset = (input.page - 1) * input.pageSize;
    const [items, [{ total }]] = await Promise.all([
      db.select({ task: tasks }).from(tasks).innerJoin(projects, eq(projects.id, tasks.projectId)).where(where).orderBy(...orderBy(input)).limit(input.pageSize).offset(offset).then((rows) => rows.map((row) => row.task)),
      db.select({ total: count() }).from(tasks).innerJoin(projects, eq(projects.id, tasks.projectId)).where(where),
    ]);
    return { items, total: Number(total) };
  },
  async findById(id, access) {
    const [row] = await db.select({ task: tasks }).from(tasks).innerJoin(projects, eq(projects.id, tasks.projectId)).where(and(eq(tasks.id, id), isNull(tasks.archivedAt), isNull(projects.archivedAt), accessCondition(access))).limit(1);
    return row?.task ?? null;
  },
  async findByIdForMutation(id) {
    const [task] = await db.select().from(tasks).where(and(eq(tasks.id, id), isNull(tasks.archivedAt))).limit(1);
    return task ?? null;
  },
  async findProject(projectId, access) {
    const [project] = await db.select().from(projects).where(and(eq(projects.id, projectId), isNull(projects.archivedAt), accessCondition(access))).limit(1);
    return project ?? null;
  },
  async isProjectMember(projectId, userId) {
    const [member] = await db.select({ userId: projectMembers.userId }).from(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId))).limit(1);
    return Boolean(member);
  },
  async findActiveUser(userId) {
    const [user] = await db.select({ id: users.id, name: users.name, email: users.email, isActive: users.isActive }).from(users).where(eq(users.id, userId)).limit(1);
    return user ?? null;
  },
  async create(input) {
    const [task] = await db.insert(tasks).values(input).returning();
    if (!task) throw new Error("Task insert did not return a record");
    return task;
  },
  async update(id, input) {
    const [task] = await db.update(tasks).set({ ...input, updatedAt: new Date() }).where(eq(tasks.id, id)).returning();
    if (!task) throw new Error("Task update did not return a record");
    return task;
  },
  async archive(id) {
    const [task] = await db.update(tasks).set({ archivedAt: new Date(), updatedAt: new Date() }).where(and(eq(tasks.id, id), isNull(tasks.archivedAt))).returning();
    return task ?? null;
  },
  async countOpen(projectId) {
    const [row] = await db.select({ total: count() }).from(tasks).where(and(eq(tasks.projectId, projectId), isNull(tasks.archivedAt), inArray(tasks.status, ["todo", "in_progress", "blocked"])));
    return Number(row?.total ?? 0);
  },
  async countOpenAssigned(projectId, userId) {
    const [row] = await db.select({ total: count() }).from(tasks).where(and(eq(tasks.projectId, projectId), eq(tasks.assigneeId, userId), isNull(tasks.archivedAt), inArray(tasks.status, ["todo", "in_progress", "blocked"])));
    return Number(row?.total ?? 0);
  },
};
