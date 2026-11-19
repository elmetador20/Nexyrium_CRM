import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { leadActivities, leadSourceHistory, leads } from "@/db/schema";
import type { LeadActivity, LeadSourceHistory, Lead } from "@/db/schema";
import type { LeadListInput } from "@/features/crm/leads/schemas";
import { ACQUISITION_PREFIX } from "../acquisition-source";
import type { CrmScope } from "@/features/crm/shared/types";

export type LeadMutation = Pick<
  typeof leads.$inferInsert,
  | "contactName"
   | "email"
   | "phone"
   | "normalizedEmail"
   | "normalizedPhone"
   | "normalizationVersion"
  | "companyName"
  | "source"
  | "sourceDetails"
  | "status"
  | "ownerId"
  | "departmentId"
  | "notes"
  | "nextAction"
  | "nextActionAt"
>;

export type LeadRepository = {
  list(input: LeadListInput, scope: CrmScope): Promise<{ items: Lead[]; total: number }>;
  findById(id: string, scope: CrmScope): Promise<Lead | null>;
  create(input: LeadMutation): Promise<Lead>;
  update(id: string, input: Partial<LeadMutation>, scope: CrmScope): Promise<Lead | null>;
  archive(id: string, scope: CrmScope): Promise<Lead | null>;
  addActivity(input: typeof leadActivities.$inferInsert): Promise<LeadActivity>;
  listActivities(leadId: string): Promise<LeadActivity[]>;
  addSourceHistory(input: typeof leadSourceHistory.$inferInsert): Promise<LeadSourceHistory>;
  listSourceHistory(leadId: string): Promise<LeadSourceHistory[]>;
};

function scopeCondition(scope: CrmScope) {
  if (scope.kind === "global") return undefined;
  if (scope.kind === "owner") return eq(leads.ownerId, scope.userId);
  return scope.departmentIds.length ? inArray(leads.departmentId, scope.departmentIds) : sql`false`;
}

function listWhere(input: LeadListInput, scope: CrmScope) {
  const search = input.search ? `%${input.search}%` : undefined;
  return and(
    isNull(leads.archivedAt),
    scopeCondition(scope),
    input.status ? eq(leads.status, input.status) : undefined,
    input.departmentId ? eq(leads.departmentId, input.departmentId) : undefined,
    input.source ? eq(leads.source, input.source) : undefined,
    input.acquisitionSource
      ? sql`coalesce(
          case when split_part(${leads.sourceDetails}, chr(10), 1) in
            (${ACQUISITION_PREFIX + "organic"}, ${ACQUISITION_PREFIX + "meta ad"},
             ${ACQUISITION_PREFIX + "google ad"}, ${ACQUISITION_PREFIX + "partner"})
          then substring(split_part(${leads.sourceDetails}, chr(10), 1) from ${ACQUISITION_PREFIX.length + 1})
          end,
          case when lower(${leads.source}) like 'meta:%' then 'meta ad'
               else lower(trim(${leads.source})) end
        ) = ${input.acquisitionSource}`
      : undefined,
    search ? or(ilike(leads.contactName, search), ilike(leads.companyName, search), ilike(leads.email, search)) : undefined,
  );
}

export const leadRepository: LeadRepository = {
  async list(input, scope) {
    const where = listWhere(input, scope);
    const offset = (input.page - 1) * input.pageSize;
    const [items, [{ total }]] = await Promise.all([
      db.select().from(leads).where(where).orderBy(desc(leads.createdAt)).limit(input.pageSize).offset(offset),
      db.select({ total: count() }).from(leads).where(where),
    ]);
    return { items, total: Number(total) };
  },
  async findById(id, scope) {
    const [lead] = await db
      .select()
      .from(leads)
      .where(and(eq(leads.id, id), isNull(leads.archivedAt), scopeCondition(scope)))
      .limit(1);
    return lead ?? null;
  },
  async create(input) {
    const [lead] = await db.insert(leads).values(input).returning();
    if (!lead) throw new Error("Lead insert did not return a record");
    return lead;
  },
  async update(id, input, scope) {
    const [lead] = await db
      .update(leads)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(leads.id, id), isNull(leads.archivedAt), scopeCondition(scope)))
      .returning();
    return lead ?? null;
  },
  async archive(id, scope) {
    const [lead] = await db
      .update(leads)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(leads.id, id), isNull(leads.archivedAt), scopeCondition(scope)))
      .returning();
    return lead ?? null;
  },
  async addActivity(input) {
    const [activity] = await db.insert(leadActivities).values(input).returning();
    if (!activity) throw new Error("Lead activity insert did not return a record");
    return activity;
  },
  async listActivities(leadId) {
    return db.select().from(leadActivities).where(eq(leadActivities.leadId, leadId)).orderBy(desc(leadActivities.occurredAt));
  },
  async addSourceHistory(input) {
    const [history] = await db.insert(leadSourceHistory).values(input).returning();
    if (!history) throw new Error("Lead source history insert did not return a record");
    return history;
  },
  async listSourceHistory(leadId) {
    return db.select().from(leadSourceHistory).where(eq(leadSourceHistory.leadId, leadId)).orderBy(asc(leadSourceHistory.recordedAt));
  },
};
