import { and, gte, lte, ne, ilike, or, count, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { accountingAccounts, accountingPeriods, accountingReconciliationItems, accountingReconciliations, expenseReceipts, expenses, journalEntries, journalEntryLines, journalEntrySources, financeCommands, documents, documentStorageObjects, invoices, payments } from "@/db/schema";
import type { CrmScope } from "@/features/crm/shared/types";
import { AccountingError } from "../errors";

export type AccountingScope = CrmScope;
export type AccountingTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function expenseScopeCondition(scope: AccountingScope) {
  if (scope.kind === "global") return undefined;
  if (scope.kind === "owner") return eq(expenses.ownerId, scope.userId);
  return scope.departmentIds.length ? inArray(expenses.departmentId, scope.departmentIds) : sql`false`;
}

export async function listExpenses(input: { page: number; pageSize: number; status?: string; from?:string; to?:string; departmentId?:string;search?:string;includedOnly?:boolean }, scope: AccountingScope) {
  const query=input.search ? "%"+input.search+"%" : undefined;
  const where = and(expenseScopeCondition(scope),input.departmentId?eq(expenses.departmentId,input.departmentId):undefined,input.from?gte(expenses.incurredOn,input.from):undefined,input.to?lte(expenses.incurredOn,input.to):undefined,input.includedOnly?ne(expenses.status,"rejected"):undefined,query?or(ilike(expenses.description,query),ilike(expenses.category,query),ilike(expenses.merchantName,query)):undefined, input.status ? eq(expenses.status, input.status as typeof expenses.$inferSelect.status) : undefined);
  const [items, [{ total }]] = await Promise.all([
    db.select().from(expenses).where(where).orderBy(desc(expenses.createdAt), desc(expenses.id)).limit(input.pageSize).offset((input.page - 1) * input.pageSize),
    db.select({ total: count() }).from(expenses).where(where),
  ]);
  return { items, total: Number(total) };
}

export async function getExpense(id: string, scope: AccountingScope) {
  const [expense] = await db.select().from(expenses).where(and(eq(expenses.id, id), expenseScopeCondition(scope))).limit(1);
  if (!expense) return null;
  const receipts = await db.select({ relation: expenseReceipts, document: documents, storage: documentStorageObjects }).from(expenseReceipts).innerJoin(documents, eq(documents.id, expenseReceipts.documentId)).leftJoin(documentStorageObjects, eq(documentStorageObjects.documentId, documents.id)).where(eq(expenseReceipts.expenseId, id));
  return { expense, receipts };
}

export async function findExpense(id: string, scope?: AccountingScope) {
  const [expense] = await db.select().from(expenses).where(and(eq(expenses.id, id), scope ? expenseScopeCondition(scope) : undefined)).limit(1);
  return expense ?? null;
}

export async function listAccounts(activeOnly = true) {
  return db.select().from(accountingAccounts).where(activeOnly ? eq(accountingAccounts.isActive, true) : undefined).orderBy(accountingAccounts.code);
}

export async function getAccount(id: string) {
  const [account] = await db.select().from(accountingAccounts).where(eq(accountingAccounts.id, id)).limit(1);
  return account ?? null;
}

export async function listPeriods(status?: string) {
  return db.select().from(accountingPeriods).where(status ? eq(accountingPeriods.status, status as typeof accountingPeriods.$inferSelect.status) : undefined).orderBy(desc(accountingPeriods.periodKey));
}

export async function getPeriod(id: string) {
  const [period] = await db.select().from(accountingPeriods).where(eq(accountingPeriods.id, id)).limit(1);
  return period ?? null;
}

export async function getJournalEntry(id: string) {
  const [entry] = await db.select().from(journalEntries).where(eq(journalEntries.id, id)).limit(1);
  if (!entry) return null;
  const [lines, sources] = await Promise.all([
    db.select().from(journalEntryLines).where(eq(journalEntryLines.journalEntryId, id)).orderBy(journalEntryLines.position),
    db.select().from(journalEntrySources).where(eq(journalEntrySources.journalEntryId, id)),
  ]);
  return { entry, lines, sources };
}

export async function listJournalEntries(input: { page: number; pageSize: number; status?: string; periodId?: string }) {
  const where = and(input.status ? eq(journalEntries.status, input.status as typeof journalEntries.$inferSelect.status) : undefined, input.periodId ? eq(journalEntries.periodId, input.periodId) : undefined);
  const [items, [{ total }]] = await Promise.all([
    db.select().from(journalEntries).where(where).orderBy(desc(journalEntries.entryDate), desc(journalEntries.createdAt)).limit(input.pageSize).offset((input.page - 1) * input.pageSize),
    db.select({ total: count() }).from(journalEntries).where(where),
  ]);
  return { items, total: Number(total) };
}

export async function listReconciliations(input: { page: number; pageSize: number; status?: string }) {
  const where = input.status ? eq(accountingReconciliations.status, input.status as typeof accountingReconciliations.$inferSelect.status) : undefined;
  const [items, [{ total }]] = await Promise.all([
    db.select().from(accountingReconciliations).where(where).orderBy(desc(accountingReconciliations.createdAt)).limit(input.pageSize).offset((input.page - 1) * input.pageSize),
    db.select({ total: count() }).from(accountingReconciliations).where(where),
  ]);
  return { items, total: Number(total) };
}

export async function getReconciliation(id: string) {
  const [reconciliation] = await db.select().from(accountingReconciliations).where(eq(accountingReconciliations.id, id)).limit(1);
  if (!reconciliation) return null;
  const items = await db.select().from(accountingReconciliationItems).where(eq(accountingReconciliationItems.reconciliationId, id)).orderBy(accountingReconciliationItems.transactionOn, accountingReconciliationItems.id);
  return { reconciliation, items };
}

export async function claimCommand(tx: AccountingTransaction, input: { operation: string; idempotencyKey: string; payloadHash: string; actorUserId: string; correlationId?: string | null }) {
  const [created] = await tx.insert(financeCommands).values({ ...input, correlationId: input.correlationId ?? null }).onConflictDoNothing({ target: [financeCommands.operation, financeCommands.idempotencyKey] }).returning();
  if (created) return { replayed: false as const, command: created };
  const [existing] = await tx.select().from(financeCommands).where(and(eq(financeCommands.operation, input.operation), eq(financeCommands.idempotencyKey, input.idempotencyKey))).limit(1);
  if (!existing) throw new AccountingError("CONFLICT", "The idempotent operation could not be resumed.");
  if (existing.payloadHash !== input.payloadHash) throw new AccountingError("IDEMPOTENCY_CONFLICT", "The idempotency key was reused with different data.");
  if (existing.status === "completed" && existing.result) return { replayed: true as const, command: existing };
  throw new AccountingError("CONFLICT", "The same operation is already being processed; retry later.");
}

export async function completeCommand(tx: AccountingTransaction, commandId: string, result: Record<string, unknown>) {
  await tx.update(financeCommands).set({ status: "completed", result, updatedAt: new Date() }).where(eq(financeCommands.id, commandId));
}

export async function validateSourceReference(sourceType: string, sourceId: string) {
  if (sourceType === "expense") {
    const expense = await findExpense(sourceId);
    if (!expense) throw new AccountingError("NOT_FOUND", "Expense source not found.");
    if (expense.status !== "approved") throw new AccountingError("CONFLICT", "Only approved expenses can be referenced by an accounting journal.");
  }
  if (sourceType === "invoice") {
    const [invoice] = await db.select({ id: invoices.id, status: invoices.status }).from(invoices).where(eq(invoices.id, sourceId)).limit(1);
    if (!invoice) throw new AccountingError("NOT_FOUND", "Invoice source not found.");
    if (invoice.status === "draft" || invoice.status === "voided") throw new AccountingError("CONFLICT", "Only issued invoices can be referenced by an accounting journal.");
  }
  if (sourceType === "payment") {
    const [payment] = await db.select({ id: payments.id, status: payments.status }).from(payments).where(eq(payments.id, sourceId)).limit(1);
    if (!payment) throw new AccountingError("NOT_FOUND", "Payment source not found.");
    if (payment.status !== "posted") throw new AccountingError("CONFLICT", "Only posted payments can be referenced by an accounting journal.");
  }
}
