import { and, count, getTableColumns, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { clientContacts, clientLeads, clients, users, deals, leads } from "@/db/schema";
import type { Client, ClientContact, ClientLead, Deal } from "@/db/schema";
import type { ClientListInput } from "@/features/crm/clients/schemas";
import type { CrmScope } from "@/features/crm/shared/types";

export type ClientMutation = Pick<
  typeof clients.$inferInsert,
  "name" | "companyName" | "email" | "phone" | "website" | "ownerId" | "departmentId" | "notes"
>;

export type ClientRepository = {
  list(input: ClientListInput, scope: CrmScope): Promise<{ items: (Client & {ownerName?: string|null})[]; total: number }>;
  findById(id: string, scope: CrmScope): Promise<Client | null>;
  create(input: ClientMutation): Promise<Client>;
  update(id: string, input: Partial<ClientMutation>, scope: CrmScope): Promise<Client | null>;
  archive(id: string, scope: CrmScope): Promise<Client | null>;
  listContacts(clientId: string): Promise<ClientContact[]>;
  listLeadLinks(clientId: string, scope:CrmScope): Promise<ClientLead[]>;
  listDeals(clientId: string, scope:CrmScope): Promise<Deal[]>;
  replaceContacts(clientId: string, contacts: Omit<typeof clientContacts.$inferInsert, "clientId">[]): Promise<ClientContact[]>;
  linkLead(input: typeof clientLeads.$inferInsert): Promise<ClientLead>;
};

function scopeCondition(scope: CrmScope, table: typeof clients | typeof leads | typeof deals = clients) {
  if (scope.kind === "global") return undefined;
  if (scope.kind === "owner") return eq(table.ownerId, scope.userId);
  return scope.departmentIds.length ? inArray(table.departmentId, scope.departmentIds) : sql`false`;
}

function listWhere(input: ClientListInput, scope: CrmScope) {
  const search = input.search ? `%${input.search}%` : undefined;
  return and(
    isNull(clients.archivedAt),
    scopeCondition(scope),
    input.departmentId ? eq(clients.departmentId, input.departmentId) : undefined,
    search ? or(ilike(clients.name, search), ilike(clients.companyName, search), ilike(clients.email, search), ilike(clients.phone, search)) : undefined,
  );
}

export const clientRepository: ClientRepository = {
  async list(input, scope) {
    const where = listWhere(input, scope);
    const offset = (input.page - 1) * input.pageSize;
    const [items, [{ total }]] = await Promise.all([
      db.select({...getTableColumns(clients),ownerName:sql<string|null>`coalesce(${users.name},${users.email})`}).from(clients).leftJoin(users,eq(users.id,clients.ownerId)).where(where).orderBy(desc(clients.createdAt)).limit(input.pageSize).offset(offset),
      db.select({ total: count() }).from(clients).where(where),
    ]);
    return { items, total: Number(total) };
  },
  async findById(id, scope) {
    const [client] = await db
      .select()
      .from(clients)
      .where(and(eq(clients.id, id), isNull(clients.archivedAt), scopeCondition(scope)))
      .limit(1);
    return client ?? null;
  },
  async create(input) {
    const [client] = await db.insert(clients).values(input).returning();
    if (!client) throw new Error("Client insert did not return a record");
    return client;
  },
  async update(id, input, scope) {
    const [client] = await db
      .update(clients)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(clients.id, id), isNull(clients.archivedAt), scopeCondition(scope)))
      .returning();
    return client ?? null;
  },
  async archive(id, scope) {
    const [client] = await db
      .update(clients)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(clients.id, id), isNull(clients.archivedAt), scopeCondition(scope)))
      .returning();
    return client ?? null;
  },
  async listContacts(clientId) {
    return db.select().from(clientContacts).where(eq(clientContacts.clientId, clientId)).orderBy(desc(clientContacts.isPrimary));
  },
  async listLeadLinks(clientId,scope) {
    return db.select(getTableColumns(clientLeads)).from(clientLeads).innerJoin(leads,eq(leads.id,clientLeads.leadId)).where(and(eq(clientLeads.clientId, clientId),isNull(leads.archivedAt),scopeCondition(scope,leads)));
  },
  async listDeals(clientId,scope) {
    return db.select().from(deals).where(and(eq(deals.clientId, clientId), scopeCondition(scope,deals), isNull(deals.archivedAt))).orderBy(desc(deals.createdAt));
  },
  async replaceContacts(clientId, contacts) {
    return db.transaction(async tx => {
      await tx.select({id:clients.id}).from(clients).where(eq(clients.id,clientId)).for("update");
      await tx.delete(clientContacts).where(eq(clientContacts.clientId,clientId));
      if (!contacts.length) return [];
      return tx.insert(clientContacts).values(contacts.map(contact=>({...contact,clientId}))).returning();
    });
  },
  async linkLead(input) {
    const [link] = await db.insert(clientLeads).values(input).onConflictDoNothing().returning();
    if (!link) {
      const [existing] = await db
        .select()
        .from(clientLeads)
        .where(and(eq(clientLeads.clientId, input.clientId), eq(clientLeads.leadId, input.leadId)))
        .limit(1);
      if (!existing) throw new Error("Client lead link did not persist");
      return existing;
    }
    return link;
  },
};
