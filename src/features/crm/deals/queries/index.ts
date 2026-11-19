import { and, count, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { deals } from "@/db/schema";
import type { Deal } from "@/db/schema";
import type { DealListInput } from "@/features/crm/deals/schemas";
import type { CrmScope } from "@/features/crm/shared/types";

export type DealMutation = Pick<
  typeof deals.$inferInsert,
  | "title"
  | "stage"
  | "expectedValue"
  | "currency"
  | "expectedCloseDate"
  | "ownerId"
  | "departmentId"
  | "clientId"
  | "leadId"
  | "notes"
>;

export type DealRepository = {
  list(input: DealListInput, scope: CrmScope): Promise<{ items: Deal[]; total: number }>;
  findById(id: string, scope: CrmScope): Promise<Deal | null>;
  create(input: DealMutation): Promise<Deal>;
  update(id: string, input: Partial<DealMutation>, scope: CrmScope): Promise<Deal | null>;
  archive(id: string, scope: CrmScope): Promise<Deal | null>;
};

function scopeCondition(scope: CrmScope) {
  if (scope.kind === "global") return undefined;
  if (scope.kind === "owner") return eq(deals.ownerId, scope.userId);
  return scope.departmentIds.length ? inArray(deals.departmentId, scope.departmentIds) : sql`false`;
}

function listWhere(input: DealListInput, scope: CrmScope) {
  const search = input.search ? `%${input.search}%` : undefined;
  return and(
    isNull(deals.archivedAt),
    scopeCondition(scope),
    input.stage ? eq(deals.stage, input.stage) : undefined,
    input.departmentId ? eq(deals.departmentId, input.departmentId) : undefined,
    search ? or(ilike(deals.title, search), ilike(deals.currency, search)) : undefined,
  );
}

export const dealRepository: DealRepository = {
  async list(input, scope) {
    const where = listWhere(input, scope);
    const offset = (input.page - 1) * input.pageSize;
    const [items, [{ total }]] = await Promise.all([
      db.select().from(deals).where(where).orderBy(desc(deals.createdAt)).limit(input.pageSize).offset(offset),
      db.select({ total: count() }).from(deals).where(where),
    ]);
    return { items, total: Number(total) };
  },
  async findById(id, scope) {
    const [deal] = await db
      .select()
      .from(deals)
      .where(and(eq(deals.id, id), isNull(deals.archivedAt), scopeCondition(scope)))
      .limit(1);
    return deal ?? null;
  },
  async create(input) {
    const [deal] = await db.insert(deals).values(input).returning();
    if (!deal) throw new Error("Deal insert did not return a record");
    return deal;
  },
  async update(id, input, scope) {
    const [deal] = await db
      .update(deals)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(deals.id, id), isNull(deals.archivedAt), scopeCondition(scope)))
      .returning();
    return deal ?? null;
  },
  async archive(id, scope) {
    const [deal] = await db
      .update(deals)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(deals.id, id), isNull(deals.archivedAt), scopeCondition(scope)))
      .returning();
    return deal ?? null;
  },
};
