import { and, count, desc, eq, getTableColumns, ilike, inArray, isNull, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { clients, deals, projects } from "@/db/schema";
import type { CrmScope } from "@/features/crm/shared/types";
import { invoiceLines, invoices, paymentAllocations, payments, quotationLines, quotationVersions, quotations, financeCommands, financeNumberSequences, invoiceVersions } from "@/db/schema";
import type { FinanceCommand } from "@/db/schema";
import { formatFinancialNumber } from "./numbering";

export type FinanceScope = CrmScope;

export function scopeCondition(table: typeof quotations | typeof invoices | typeof payments, scope: FinanceScope) {
  if (scope.kind === "global") return undefined;
  if (scope.kind === "owner") return eq(table.ownerId, scope.userId);
  return scope.departmentIds.length ? inArray(table.departmentId, scope.departmentIds) : sql`false`;
}

function clientScopeCondition(scope: FinanceScope) {
  if (scope.kind === "global") return undefined;
  if (scope.kind === "owner") return eq(clients.ownerId, scope.userId);
  return scope.departmentIds.length ? inArray(clients.departmentId, scope.departmentIds) : sql`false`;
}

export async function findClient(id: string, scope: CrmScope) {
  const condition = scope.kind === "global" ? undefined : scope.kind === "owner" ? eq(clients.ownerId, scope.userId) : scope.departmentIds.length ? inArray(clients.departmentId, scope.departmentIds) : sql`false`;
  const [client] = await db.select().from(clients).where(and(eq(clients.id, id), isNull(clients.archivedAt), condition)).limit(1);
  return client ?? null;
}

export async function findDeal(id: string, scope: CrmScope) {
  const condition = scope.kind === "global" ? undefined : scope.kind === "owner" ? eq(deals.ownerId, scope.userId) : scope.departmentIds.length ? inArray(deals.departmentId, scope.departmentIds) : sql`false`;
  const [deal] = await db.select().from(deals).where(and(eq(deals.id, id), isNull(deals.archivedAt), condition)).limit(1);
  return deal ?? null;
}

export async function findProject(id: string, scope: CrmScope) {
  const condition = scope.kind === "global" ? undefined : scope.kind === "owner" ? eq(projects.ownerId, scope.userId) : scope.departmentIds.length ? inArray(projects.departmentId, scope.departmentIds) : sql`false`;
  const [project] = await db.select().from(projects).where(and(eq(projects.id, id), isNull(projects.archivedAt), condition)).limit(1);
  return project ?? null;
}

export async function findQuotation(id: string, scope: FinanceScope) {
  const [quotation] = await db.select().from(quotations).where(and(eq(quotations.id, id), scopeCondition(quotations, scope))).limit(1);
  return quotation ?? null;
}

export async function listFinanceClients(input: { page: number; pageSize: number; search?: string }, scope: FinanceScope) {
  const search = input.search ? `%${input.search}%` : undefined;
  const where = and(
    isNull(clients.archivedAt),
    clientScopeCondition(scope),
    search ? or(ilike(clients.name, search), ilike(clients.companyName, search), ilike(clients.email, search)) : undefined,
  );
  const [items, [{ total }]] = await Promise.all([
    db.select({ id: clients.id, name: clients.name, companyName: clients.companyName, email: clients.email }).from(clients).where(where).orderBy(clients.name, clients.id).limit(input.pageSize).offset((input.page - 1) * input.pageSize),
    db.select({ total: count() }).from(clients).where(where),
  ]);
  return { items, total: Number(total) };
}

export async function listQuotations(input: { page: number; pageSize: number; status?: string; clientId?: string }, scope: FinanceScope) {
  const where = and(isNull(quotations.canceledAt), scopeCondition(quotations, scope), input.status ? eq(quotations.status, input.status as typeof quotations.$inferSelect.status) : undefined, input.clientId ? eq(quotations.clientId, input.clientId) : undefined);
  const [items, [{ total }]] = await Promise.all([
    db.select().from(quotations).where(where).orderBy(desc(quotations.createdAt), desc(quotations.id)).limit(input.pageSize).offset((input.page - 1) * input.pageSize),
    db.select({ total: count() }).from(quotations).where(where),
  ]);
  return { items, total: Number(total) };
}

export async function getQuotation(id: string, scope: FinanceScope) {
  const [quotation] = await db.select().from(quotations).where(and(eq(quotations.id, id), scopeCondition(quotations, scope))).limit(1);
  if (!quotation) return null;
  const lines = await db.select().from(quotationLines).where(eq(quotationLines.quotationId, id)).orderBy(quotationLines.position);
  const versions = await db.select().from(quotationVersions).where(eq(quotationVersions.quotationId, id)).orderBy(desc(quotationVersions.revision));
  return { quotation, lines, versions };
}

export async function getInvoice(id: string, scope: FinanceScope) {
  const [invoice] = await db.select().from(invoices).where(and(eq(invoices.id, id), scopeCondition(invoices, scope))).limit(1);
  if (!invoice) return null;
  const [lines, versions, allocations, clientRows] = await Promise.all([
    db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, id)).orderBy(invoiceLines.position),
    db.select().from(invoiceVersions).where(eq(invoiceVersions.invoiceId, id)).orderBy(desc(invoiceVersions.createdAt)),
    db.select().from(paymentAllocations).where(eq(paymentAllocations.invoiceId, id)),
    db.select({ id: clients.id, name: clients.name, companyName: clients.companyName, email: clients.email, phone: clients.phone, website: clients.website }).from(clients).where(eq(clients.id, invoice.clientId)).limit(1),
  ]);
  return { invoice, client: clientRows[0] ?? null, lines, versions, allocations };
}

/** Allocations only count when their payment is still posted (reversed and refunded payments no longer settle invoices). */
const postedPaidMinor = sql<string>`coalesce((select sum(${paymentAllocations.allocatedAmountMinor}) from ${paymentAllocations} inner join ${payments} on ${payments.id} = ${paymentAllocations.paymentId} where ${paymentAllocations.invoiceId} = ${invoices.id} and ${payments.status} = 'posted'), 0)`;

function invoiceStatusCondition(status?: string) {
  if (!status) return undefined;
  // Computed views: issued invoices with a remaining balance, optionally past due.
  const open = and(inArray(invoices.status, ["issued", "partially_paid", "overdue"]), sql`${invoices.totalMinor} > ${postedPaidMinor}`);
  if (status === "outstanding") return open;
  if (status === "overdue") return and(open, or(eq(invoices.status, "overdue"), sql`${invoices.dueDate} < current_date`));
  return eq(invoices.status, status as typeof invoices.$inferSelect.status);
}

export async function listInvoices(input: { page: number; pageSize: number; status?: string; clientId?: string | null }, scope: FinanceScope) {
  const where = and(scopeCondition(invoices, scope), invoiceStatusCondition(input.status), input.clientId ? eq(invoices.clientId, input.clientId) : undefined);
  const [items, [{ total }]] = await Promise.all([
    db.select({
      ...getTableColumns(invoices),
      clientName: clients.name,
      clientCompanyName: clients.companyName,
      paidMinor: postedPaidMinor,
    }).from(invoices).leftJoin(clients, eq(clients.id, invoices.clientId)).where(where).orderBy(desc(invoices.createdAt), desc(invoices.id)).limit(input.pageSize).offset((input.page - 1) * input.pageSize),
    db.select({ total: count() }).from(invoices).where(where),
  ]);
  return { items, total: Number(total) };
}

export async function claimCommand(input: { operation: string; idempotencyKey: string; payloadHash: string; actorUserId: string; correlationId?: string | null }): Promise<{ created: boolean; command: FinanceCommand }> {
  const [created] = await db.insert(financeCommands).values({ ...input, correlationId: input.correlationId ?? null }).onConflictDoNothing({ target: [financeCommands.operation, financeCommands.idempotencyKey] }).returning();
  if (created) return { created: true, command: created };
  const [existing] = await db.select().from(financeCommands).where(and(eq(financeCommands.operation, input.operation), eq(financeCommands.idempotencyKey, input.idempotencyKey))).limit(1);
  if (!existing) throw new Error("Finance command could not be claimed");
  return { created: false, command: existing };
}

export async function allocateNumber(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], documentType: "quotation" | "invoice" | "journal_entry", prefix: string, date = new Date()) {
  const periodKey = String(date.getUTCFullYear());
  const [sequence] = await tx.insert(financeNumberSequences).values({ documentType, periodKey, prefix, nextValue: 2 }).onConflictDoUpdate({ target: [financeNumberSequences.documentType, financeNumberSequences.periodKey], set: { nextValue: sql`${financeNumberSequences.nextValue} + 1`, updatedAt: new Date() } }).returning();
  if (!sequence) throw new Error("Finance number sequence could not be allocated");
  const value = sequence.nextValue - 1;
  return { number: formatFinancialNumber(sequence.prefix, Number(periodKey), value), sequence: value };
}

export async function dbTransaction<T>(work: Parameters<typeof db.transaction>[0]): Promise<T> {
  return db.transaction(work) as Promise<T>;
}
