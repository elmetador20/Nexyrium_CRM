import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { leadImportJobs, leadImportRows } from "@/db/schema";
import type { LeadImportJob } from "@/db/schema";
import type { CrmScope } from "@/features/crm/shared/types";

export type ImportRepository = {
  createJob(input: typeof leadImportJobs.$inferInsert): Promise<typeof leadImportJobs.$inferSelect>;
  createRows(input: Array<typeof leadImportRows.$inferInsert>): Promise<typeof leadImportRows.$inferSelect[]>;
  findJob(id: string, scope: CrmScope): Promise<typeof leadImportJobs.$inferSelect | null>;
  claimJob(input: { id: string; scope: CrmScope; statuses: Array<LeadImportJob["status"]>; startedAt: Date }): Promise<boolean>;
  listRows(jobId: string): Promise<typeof leadImportRows.$inferSelect[]>;
  updateJob(id: string, input: Partial<typeof leadImportJobs.$inferInsert>): Promise<void>;
  updateRow(id: string, input: Partial<typeof leadImportRows.$inferInsert>): Promise<typeof leadImportRows.$inferSelect>;
};

function scopeCondition(scope: CrmScope) {
  if (scope.kind === "global") return undefined;
  if (scope.kind === "owner") return eq(leadImportJobs.createdByUserId, scope.userId);
  return scope.departmentIds.length ? inArray(leadImportJobs.departmentId, scope.departmentIds) : sql`false`;
}

export const importRepository: ImportRepository = {
  async createJob(input) {
    const [job] = await db.insert(leadImportJobs).values(input).returning();
    if (!job) throw new Error("Import job insert did not return a record");
    return job;
  },
  async createRows(input) {
    if (!input.length) return [];
    return db.insert(leadImportRows).values(input).returning();
  },
  async findJob(id, scope) {
    const [job] = await db.select().from(leadImportJobs).where(and(eq(leadImportJobs.id, id), scopeCondition(scope))).limit(1);
    return job ?? null;
  },
  async claimJob({ id, scope, statuses, startedAt }) {
    if (!statuses.length) return false;
    const [job] = await db
      .update(leadImportJobs)
      .set({ status: "processing", startedAt, completedAt: null, updatedAt: new Date() })
      .where(and(eq(leadImportJobs.id, id), inArray(leadImportJobs.status, statuses), scopeCondition(scope)))
      .returning({ id: leadImportJobs.id });
    return Boolean(job);
  },
  async listRows(jobId) {
    return db.select().from(leadImportRows).where(eq(leadImportRows.jobId, jobId)).orderBy(asc(leadImportRows.rowNumber));
  },
  async updateJob(id, input) {
    await db.update(leadImportJobs).set({ ...input, updatedAt: new Date() }).where(eq(leadImportJobs.id, id));
  },
  async updateRow(id, input) {
    const [row] = await db.update(leadImportRows).set({ ...input, updatedAt: new Date() }).where(eq(leadImportRows.id, id)).returning();
    if (!row) throw new Error("Import row update did not return a record");
    return row;
  },
};

export async function createImportJobTransaction<T>(work: (repository: ImportRepository) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) =>
    work({
      async createJob(input) {
        const [job] = await tx.insert(leadImportJobs).values(input).returning();
        if (!job) throw new Error("Import job insert did not return a record");
        return job;
      },
      async createRows(input) {
        if (!input.length) return [];
        return tx.insert(leadImportRows).values(input).returning();
      },
      async findJob(id, scope) {
        const [job] = await tx.select().from(leadImportJobs).where(and(eq(leadImportJobs.id, id), scopeCondition(scope))).limit(1);
        return job ?? null;
      },
      async claimJob({ id, scope, statuses, startedAt }) {
        if (!statuses.length) return false;
        const [job] = await tx
          .update(leadImportJobs)
          .set({ status: "processing", startedAt, completedAt: null, updatedAt: new Date() })
          .where(and(eq(leadImportJobs.id, id), inArray(leadImportJobs.status, statuses), scopeCondition(scope)))
          .returning({ id: leadImportJobs.id });
        return Boolean(job);
      },
      async listRows(jobId) {
        return tx.select().from(leadImportRows).where(eq(leadImportRows.jobId, jobId)).orderBy(asc(leadImportRows.rowNumber));
      },
      async updateJob(id, input) {
        await tx.update(leadImportJobs).set({ ...input, updatedAt: new Date() }).where(eq(leadImportJobs.id, id));
      },
      async updateRow(id, input) {
        const [row] = await tx.update(leadImportRows).set({ ...input, updatedAt: new Date() }).where(eq(leadImportRows.id, id)).returning();
        if (!row) throw new Error("Import row update did not return a record");
        return row;
      },
    }),
  );
}
