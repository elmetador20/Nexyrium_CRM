import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  clients,
  deals,
  documentClients,
  documentDeals,
  documentLeads,
  documentStorageObjects,
  documents,
  leads,
} from "@/db/schema";
import type { CrmScope } from "@/features/crm/shared/types";
import type { DocumentListInput, DocumentRecordType } from "../types";

export type DocumentRecordScope = {
  id: string;
  ownerUserId: string | null;
  departmentId: string | null;
  archived: boolean;
};

export type DocumentRepository = {
  list(input: DocumentListInput, scope: CrmScope): Promise<{ items: Array<typeof documents.$inferSelect>; total: number }>;
  findById(id: string, scope: CrmScope): Promise<{ document: typeof documents.$inferSelect; storage: typeof documentStorageObjects.$inferSelect | null } | null>;
  findRecordScope(type: DocumentRecordType, id: string): Promise<DocumentRecordScope | null>;
  findLinkedRecordScopes(documentId: string): Promise<Array<DocumentRecordScope & { type: DocumentRecordType }>>;
  createPending(input: typeof documents.$inferInsert): Promise<typeof documents.$inferSelect>;
  linkRecord(input: { documentId: string; recordType: DocumentRecordType; recordId: string }): Promise<void>;
  createStorage(input: typeof documentStorageObjects.$inferInsert): Promise<typeof documentStorageObjects.$inferSelect>;
  markAvailable(documentId: string, input: { updatedByUserId: string }): Promise<typeof documents.$inferSelect>;
  markFailed(documentId: string, input: { failureCode: string; failureMessage: string; updatedByUserId: string }): Promise<void>;
  update(id: string, input: Partial<typeof documents.$inferInsert>, scope: CrmScope): Promise<typeof documents.$inferSelect | null>;
  archive(id: string, scope: CrmScope, updatedByUserId: string): Promise<typeof documents.$inferSelect | null>;
};

function scopeCondition(scope: CrmScope) {
  if (scope.kind === "global") return undefined;
  if (scope.kind === "owner") return eq(documents.ownerId, scope.userId);
  return scope.departmentIds.length ? inArray(documents.departmentId, scope.departmentIds) : sql`false`;
}

function recordDocumentIds(type: DocumentRecordType, id: string) {
  if (type === "lead") return db.select({ documentId: documentLeads.documentId }).from(documentLeads).where(eq(documentLeads.leadId, id));
  if (type === "client") return db.select({ documentId: documentClients.documentId }).from(documentClients).where(eq(documentClients.clientId, id));
  return db.select({ documentId: documentDeals.documentId }).from(documentDeals).where(eq(documentDeals.dealId, id));
}

export const documentRepository: DocumentRepository = {
  async list(input, scope) {
    const recordFilter = input.recordType && input.recordId ? inArray(documents.id, recordDocumentIds(input.recordType, input.recordId)) : undefined;
    const where = and(isNull(documents.archivedAt), scopeCondition(scope), recordFilter);
    const offset = (input.page - 1) * input.pageSize;
    const [items, [{ total }]] = await Promise.all([
      db.select().from(documents).where(where).orderBy(desc(documents.createdAt)).limit(input.pageSize).offset(offset),
      db.select({ total: count() }).from(documents).where(where),
    ]);
    return { items, total: Number(total) };
  },

  async findById(id, scope) {
    const [row] = await db
      .select({ document: documents, storage: documentStorageObjects })
      .from(documents)
      .leftJoin(documentStorageObjects, eq(documentStorageObjects.documentId, documents.id))
      .where(and(eq(documents.id, id), isNull(documents.archivedAt), scopeCondition(scope)))
      .limit(1);
    return row ?? null;
  },

  async findRecordScope(type, id) {
    if (type === "lead") {
      const [record] = await db.select({ id: leads.id, ownerUserId: leads.ownerId, departmentId: leads.departmentId, archivedAt: leads.archivedAt }).from(leads).where(eq(leads.id, id)).limit(1);
      return record ? { id: record.id, ownerUserId: record.ownerUserId, departmentId: record.departmentId, archived: Boolean(record.archivedAt) } : null;
    }
    if (type === "client") {
      const [record] = await db.select({ id: clients.id, ownerUserId: clients.ownerId, departmentId: clients.departmentId, archivedAt: clients.archivedAt }).from(clients).where(eq(clients.id, id)).limit(1);
      return record ? { id: record.id, ownerUserId: record.ownerUserId, departmentId: record.departmentId, archived: Boolean(record.archivedAt) } : null;
    }
    const [record] = await db.select({ id: deals.id, ownerUserId: deals.ownerId, departmentId: deals.departmentId, archivedAt: deals.archivedAt }).from(deals).where(eq(deals.id, id)).limit(1);
    return record ? { id: record.id, ownerUserId: record.ownerUserId, departmentId: record.departmentId, archived: Boolean(record.archivedAt) } : null;
  },

  async findLinkedRecordScopes(documentId) {
    const [leadLinks, clientLinks, dealLinks] = await Promise.all([
      db.select({ id: leads.id, ownerUserId: leads.ownerId, departmentId: leads.departmentId, archivedAt: leads.archivedAt }).from(documentLeads).innerJoin(leads, eq(leads.id, documentLeads.leadId)).where(eq(documentLeads.documentId, documentId)),
      db.select({ id: clients.id, ownerUserId: clients.ownerId, departmentId: clients.departmentId, archivedAt: clients.archivedAt }).from(documentClients).innerJoin(clients, eq(clients.id, documentClients.clientId)).where(eq(documentClients.documentId, documentId)),
      db.select({ id: deals.id, ownerUserId: deals.ownerId, departmentId: deals.departmentId, archivedAt: deals.archivedAt }).from(documentDeals).innerJoin(deals, eq(deals.id, documentDeals.dealId)).where(eq(documentDeals.documentId, documentId)),
    ]);
    return [
      ...leadLinks.map((record) => ({ type: "lead" as const, id: record.id, ownerUserId: record.ownerUserId, departmentId: record.departmentId, archived: Boolean(record.archivedAt) })),
      ...clientLinks.map((record) => ({ type: "client" as const, id: record.id, ownerUserId: record.ownerUserId, departmentId: record.departmentId, archived: Boolean(record.archivedAt) })),
      ...dealLinks.map((record) => ({ type: "deal" as const, id: record.id, ownerUserId: record.ownerUserId, departmentId: record.departmentId, archived: Boolean(record.archivedAt) })),
    ];
  },

  async createPending(input) {
    const [document] = await db.insert(documents).values(input).returning();
    if (!document) throw new Error("Document insert did not return a record");
    return document;
  },

  async createStorage(input) {
    const [storage] = await db.insert(documentStorageObjects).values(input).returning();
    if (!storage) throw new Error("Document storage metadata insert did not return a record");
    return storage;
  },

  async linkRecord(input) {
    if (input.recordType === "lead") {
      await db.insert(documentLeads).values({ documentId: input.documentId, leadId: input.recordId }).onConflictDoNothing();
      return;
    }
    if (input.recordType === "client") {
      await db.insert(documentClients).values({ documentId: input.documentId, clientId: input.recordId }).onConflictDoNothing();
      return;
    }
    await db.insert(documentDeals).values({ documentId: input.documentId, dealId: input.recordId }).onConflictDoNothing();
  },

  async markAvailable(documentId, input) {
    const [document] = await db.update(documents).set({ status: "available", failureCode: null, failureMessage: null, updatedByUserId: input.updatedByUserId, updatedAt: new Date() }).where(eq(documents.id, documentId)).returning();
    if (!document) throw new Error("Document availability update did not return a record");
    return document;
  },

  async markFailed(documentId, input) {
    await db.update(documents).set({ status: "failed", failureCode: input.failureCode, failureMessage: input.failureMessage, updatedByUserId: input.updatedByUserId, updatedAt: new Date() }).where(eq(documents.id, documentId));
  },

  async update(id, input, scope) {
    const [document] = await db.update(documents).set({ ...input, updatedAt: new Date() }).where(and(eq(documents.id, id), isNull(documents.archivedAt), scopeCondition(scope))).returning();
    return document ?? null;
  },

  async archive(id, scope, updatedByUserId) {
    const [document] = await db.update(documents).set({ status: "archived", archivedAt: new Date(), updatedByUserId, updatedAt: new Date() }).where(and(eq(documents.id, id), isNull(documents.archivedAt), scopeCondition(scope))).returning();
    return document ?? null;
  },
};
