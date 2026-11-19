import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { accountingAccounts, accountingReconciliationItems, accountingReconciliations, auditLogs, journalEntries, journalEntryLines } from "@/db/schema";
import type { AuthorizationActor } from "@/lib/authorization/policy";
import { can } from "@/lib/authorization/policy";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { parseMinor } from "@/features/finance/shared/money";
import { AccountingError } from "../errors";
import { reconciliationCreateSchema, reconciliationItemSchema, reconciliationListSchema, reconciliationMatchSchema } from "../schemas";
import { parseSignedMinor } from "../shared/balance";
import { getAccount, getPeriod, getReconciliation, listReconciliations } from "../queries";

function validDate(value: string) {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new AccountingError("INVALID", "Use valid YYYY-MM-DD reconciliation dates.");
  return value;
}

export function createReconciliationService() {
  return {
    async list(actor: AuthorizationActor, rawInput: unknown) {
      if (!can(actor, PERMISSIONS.ACCOUNTING_READ)) throw new AccountingError("FORBIDDEN", "You cannot read reconciliations.");
      return listReconciliations(reconciliationListSchema.parse(rawInput));
    },

    async get(actor: AuthorizationActor, id: string) {
      if (!can(actor, PERMISSIONS.ACCOUNTING_READ)) throw new AccountingError("FORBIDDEN", "You cannot read reconciliations.");
      const result = await getReconciliation(id);
      if (!result) throw new AccountingError("NOT_FOUND", "Reconciliation not found.");
      return result;
    },

    async create(actor: AuthorizationActor, rawInput: unknown, correlationId?: string) {
      if (!can(actor, PERMISSIONS.ACCOUNTING_RECONCILE)) throw new AccountingError("FORBIDDEN", "You cannot create reconciliations.");
      const input = reconciliationCreateSchema.parse(rawInput);
      const account = await getAccount(input.accountId);
      if (!account) throw new AccountingError("NOT_FOUND", "Accounting account not found.");
      const period = await getPeriod(input.periodId);
      if (!period) throw new AccountingError("NOT_FOUND", "Accounting period not found.");
      const start = validDate(input.statementStartOn);
      const end = validDate(input.statementEndOn);
      if (start < period.startsOn || end > period.endsOn || end < start) throw new AccountingError("INVALID", "The reconciliation dates must fit inside the selected accounting period.");
      const [reconciliation] = await db.transaction(async (tx) => {
        const [created] = await tx.insert(accountingReconciliations).values({ accountId: input.accountId, periodId: input.periodId, statementReference: input.statementReference, statementStartOn: start, statementEndOn: end, currencyCode: input.currencyCode, openingBalanceMinor: input.openingBalanceMinor, closingBalanceMinor: input.closingBalanceMinor, createdByUserId: actor.userId }).returning();
        if (!created) throw new AccountingError("INVALID", "Reconciliation could not be created.");
        await tx.insert(auditLogs).values({ actorUserId: actor.userId, action: "reconciliation.create", resourceType: "accounting_reconciliation", resourceId: created.id, outcome: "success", correlationId: correlationId ?? null, metadata: { accountId: created.accountId, periodId: created.periodId, currencyCode: created.currencyCode } });
        return [created] as const;
      });
      return reconciliation;
    },

    async addItem(actor: AuthorizationActor, id: string, rawInput: unknown, correlationId?: string) {
      if (!can(actor, PERMISSIONS.ACCOUNTING_RECONCILE)) throw new AccountingError("FORBIDDEN", "You cannot add reconciliation items.");
      const input = reconciliationItemSchema.parse(rawInput);
      const current = await getReconciliation(id);
      if (!current) throw new AccountingError("NOT_FOUND", "Reconciliation not found.");
      if (current.reconciliation.status === "completed") throw new AccountingError("CONFLICT", "Completed reconciliations are immutable.");
      validDate(input.transactionOn);
      const [item] = await db.transaction(async (tx) => {
        const [created] = await tx.insert(accountingReconciliationItems).values({ reconciliationId: id, externalTransactionId: input.externalTransactionId, transactionOn: input.transactionOn, description: input.description, amountMinor: input.amountMinor, direction: input.direction, metadata: input.metadata }).returning();
        if (!created) throw new AccountingError("INVALID", "Reconciliation item could not be created.");
        await tx.update(accountingReconciliations).set({ status: "in_progress", updatedAt: new Date() }).where(eq(accountingReconciliations.id, id));
        await tx.insert(auditLogs).values({ actorUserId: actor.userId, action: "reconciliation.item.add", resourceType: "accounting_reconciliation", resourceId: id, outcome: "success", correlationId: correlationId ?? null, metadata: { itemId: created.id, externalTransactionId: created.externalTransactionId } });
        return [created] as const;
      });
      return item;
    },

    async match(actor: AuthorizationActor, id: string, rawInput: unknown, correlationId?: string) {
      if (!can(actor, PERMISSIONS.ACCOUNTING_RECONCILE)) throw new AccountingError("FORBIDDEN", "You cannot match reconciliation items.");
      const input = reconciliationMatchSchema.parse(rawInput);
      const current = await getReconciliation(id);
      if (!current) throw new AccountingError("NOT_FOUND", "Reconciliation not found.");
      if (current.reconciliation.status === "completed") throw new AccountingError("CONFLICT", "Completed reconciliations are immutable.");
      const item = current.items.find((candidate) => candidate.id === input.itemId);
      if (!item) throw new AccountingError("NOT_FOUND", "Reconciliation item not found.");
      if (item.status === "matched") throw new AccountingError("CONFLICT", "This reconciliation item is already matched.");
      const [line] = await db.select({ line: journalEntryLines, entry: journalEntries }).from(journalEntryLines).innerJoin(journalEntries, eq(journalEntries.id, journalEntryLines.journalEntryId)).where(and(eq(journalEntryLines.id, input.journalEntryLineId), eq(journalEntries.status, "posted"))).limit(1);
      if (!line) throw new AccountingError("CONFLICT", "Only posted journal lines can be matched.");
      if (line.entry.periodId !== current.reconciliation.periodId || line.entry.currencyCode !== current.reconciliation.currencyCode || line.line.accountId !== current.reconciliation.accountId) throw new AccountingError("CONFLICT", "The journal line does not belong to this reconciliation.");
      const lineAmount = item.direction === "debit" ? line.line.debitMinor : line.line.creditMinor;
      if (lineAmount !== item.amountMinor) throw new AccountingError("CONFLICT", "The reconciliation item amount does not match the journal line.");
      const [updated] = await db.transaction(async (tx) => {
        const [record] = await tx.update(accountingReconciliationItems).set({ status: "matched", matchedJournalEntryLineId: input.journalEntryLineId, matchedByUserId: actor.userId, matchedAt: new Date(), updatedAt: new Date() }).where(and(eq(accountingReconciliationItems.id, input.itemId), eq(accountingReconciliationItems.status, "unmatched"))).returning();
        if (!record) throw new AccountingError("CONFLICT", "The reconciliation item changed before it could be matched.");
        await tx.insert(auditLogs).values({ actorUserId: actor.userId, action: "reconciliation.match", resourceType: "accounting_reconciliation", resourceId: id, outcome: "success", correlationId: correlationId ?? null, metadata: { itemId: input.itemId, journalEntryLineId: input.journalEntryLineId } });
        return [record] as const;
      });
      return updated;
    },

    async complete(actor: AuthorizationActor, id: string, correlationId?: string) {
      if (!can(actor, PERMISSIONS.ACCOUNTING_RECONCILE)) throw new AccountingError("FORBIDDEN", "You cannot complete reconciliations.");
      const current = await getReconciliation(id);
      if (!current) throw new AccountingError("NOT_FOUND", "Reconciliation not found.");
      if (current.reconciliation.status === "completed") return current.reconciliation;
      const [account] = await db.select().from(accountingAccounts).where(eq(accountingAccounts.id, current.reconciliation.accountId)).limit(1);
      if (!account) throw new AccountingError("NOT_FOUND", "Accounting account not found.");
      const [movement] = await db.select({ debit: sql<string>`coalesce(sum(${journalEntryLines.debitMinor}), 0)`, credit: sql<string>`coalesce(sum(${journalEntryLines.creditMinor}), 0)` }).from(journalEntryLines).innerJoin(journalEntries, eq(journalEntries.id, journalEntryLines.journalEntryId)).where(and(eq(journalEntryLines.accountId, account.id), eq(journalEntries.periodId, current.reconciliation.periodId), inArray(journalEntries.status, ["posted", "reversed"]), eq(journalEntries.currencyCode, current.reconciliation.currencyCode)));
      const debit = parseMinor(movement?.debit ?? "0");
      const credit = parseMinor(movement?.credit ?? "0");
      const signedMovement = account.normalBalance === "debit" ? debit - credit : credit - debit;
      const difference = parseSignedMinor(current.reconciliation.closingBalanceMinor) - (parseSignedMinor(current.reconciliation.openingBalanceMinor) + signedMovement);
      if (difference !== BigInt(0)) throw new AccountingError("CONFLICT", `Reconciliation is out of balance by ${difference.toString()} minor units.`);
      const [completed] = await db.transaction(async (tx) => {
        const [record] = await tx.update(accountingReconciliations).set({ status: "completed", calculatedDifferenceMinor: difference.toString(), completedByUserId: actor.userId, completedAt: new Date(), updatedAt: new Date() }).where(and(eq(accountingReconciliations.id, id), sql`${accountingReconciliations.status} <> 'completed'`)).returning();
        if (!record) throw new AccountingError("CONFLICT", "The reconciliation changed before completion.");
        await tx.insert(auditLogs).values({ actorUserId: actor.userId, action: "reconciliation.complete", resourceType: "accounting_reconciliation", resourceId: id, outcome: "success", correlationId: correlationId ?? null, metadata: { calculatedDifferenceMinor: difference.toString() } });
        return [record] as const;
      });
      return completed;
    },
  };
}
