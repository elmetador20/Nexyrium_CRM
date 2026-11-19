import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { accountingAccounts, accountingPeriods, auditLogs, journalEntries, journalEntryLines, journalEntrySources } from "@/db/schema";
import type { AuthorizationActor } from "@/lib/authorization/policy";
import { can } from "@/lib/authorization/policy";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { allocateNumber } from "@/features/finance/shared/repository";
import { AccountingError } from "../errors";
import { calculateJournalTotals } from "../shared/balance";
import { journalEntryCreateSchema, journalEntryListSchema, journalEntryReverseSchema } from "../schemas";
import { hashAccountingPayload, requireIdempotencyKey } from "../shared/idempotency";
import { claimCommand, completeCommand, getJournalEntry, getPeriod, listJournalEntries, validateSourceReference } from "../queries";

function validDate(value: string) {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new AccountingError("INVALID", "Use a valid YYYY-MM-DD journal date.");
  return value;
}

async function validateAccounts(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], lines: Array<{ accountId: string }>) {
  const ids = [...new Set(lines.map((line) => line.accountId))];
  const accounts = await tx.select().from(accountingAccounts).where(inArray(accountingAccounts.id, ids));
  if (accounts.length !== ids.length) throw new AccountingError("NOT_FOUND", "Every journal line must reference an existing account.");
  for (const account of accounts) {
    if (!account.isActive) throw new AccountingError("CONFLICT", `Account ${account.code} is inactive.`);
    if (!account.isPostable) throw new AccountingError("CONFLICT", `Account ${account.code} is not postable.`);
  }
}

export function createJournalEntryService() {
  return {
    async list(actor: AuthorizationActor, rawInput: unknown) {
      if (!can(actor, PERMISSIONS.ACCOUNTING_READ)) throw new AccountingError("FORBIDDEN", "You cannot read journal entries.");
      return listJournalEntries(journalEntryListSchema.parse(rawInput));
    },

    async get(actor: AuthorizationActor, id: string) {
      if (!can(actor, PERMISSIONS.ACCOUNTING_READ)) throw new AccountingError("FORBIDDEN", "You cannot read journal entries.");
      const result = await getJournalEntry(id);
      if (!result) throw new AccountingError("NOT_FOUND", "Journal entry not found.");
      return result;
    },

    async create(actor: AuthorizationActor, rawInput: unknown, correlationId?: string) {
      if (!can(actor, PERMISSIONS.ACCOUNTING_MANAGE)) throw new AccountingError("FORBIDDEN", "You cannot create journal entries.");
      const input = journalEntryCreateSchema.parse(rawInput);
      const entryDate = validDate(input.entryDate);
      const period = await getPeriod(input.periodId);
      if (!period) throw new AccountingError("NOT_FOUND", "Accounting period not found.");
      if (entryDate < period.startsOn || entryDate > period.endsOn) throw new AccountingError("INVALID", "The journal date must be inside the selected accounting period.");
      const balance = calculateJournalTotals(input.lines);
      if (balance.debit !== balance.credit) throw new AccountingError("INVALID", "Journal entry debits and credits must balance before saving.");
      for (const source of input.sources) await validateSourceReference(source.sourceType, source.sourceId);
      const [entry] = await db.transaction(async (tx) => {
        await validateAccounts(tx, input.lines);
        const [created] = await tx.insert(journalEntries).values({ entryDate, periodId: input.periodId, currencyCode: input.currencyCode, memo: input.memo, createdByUserId: actor.userId }).returning();
        if (!created) throw new AccountingError("INVALID", "Journal entry could not be created.");
        await tx.insert(journalEntryLines).values(input.lines.map((line, position) => ({ journalEntryId: created.id, position, accountId: line.accountId, description: line.description, debitMinor: line.debitMinor, creditMinor: line.creditMinor })));
        if (input.sources.length) await tx.insert(journalEntrySources).values(input.sources.map((source) => ({ journalEntryId: created.id, sourceType: source.sourceType, sourceId: source.sourceId, sourceAction: source.sourceAction, externalReference: source.externalReference ?? null, metadata: source.metadata })));
        await tx.insert(auditLogs).values({ actorUserId: actor.userId, action: "journal_entry.create", resourceType: "journal_entry", resourceId: created.id, outcome: "success", correlationId: correlationId ?? null, metadata: { periodId: created.periodId, currencyCode: created.currencyCode, lineCount: input.lines.length } });
        return [created] as const;
      });
      return entry;
    },

    async post(actor: AuthorizationActor, id: string, idempotencyKeyHeader: string | null | undefined, correlationId?: string) {
      if (!can(actor, PERMISSIONS.ACCOUNTING_POST)) throw new AccountingError("FORBIDDEN", "You cannot post journal entries.");
      const idempotencyKey = requireIdempotencyKey(idempotencyKeyHeader);
      const current = await getJournalEntry(id);
      if (!current) throw new AccountingError("NOT_FOUND", "Journal entry not found.");
      const payload = { journalEntryId: id };
      const result = await db.transaction(async (tx) => {
        const claim = await claimCommand(tx, { operation: "accounting.journal-entry.post", idempotencyKey, payloadHash: hashAccountingPayload(payload), actorUserId: actor.userId, correlationId });
        if (claim.replayed) return claim.command.result as { journalEntryId: string };
        const [entry] = await tx.select().from(journalEntries).where(eq(journalEntries.id, id)).limit(1);
        const lines = await tx.select().from(journalEntryLines).where(eq(journalEntryLines.journalEntryId, id)).orderBy(journalEntryLines.position);
        if (!entry) throw new AccountingError("NOT_FOUND", "Journal entry not found.");
        if (entry.status !== "draft") throw new AccountingError("CONFLICT", "Only draft journal entries can be posted.");
        if (lines.length < 2) throw new AccountingError("INVALID", "A journal entry must contain at least two lines.");
        const balance = calculateJournalTotals(lines);
        if (balance.debit !== balance.credit) throw new AccountingError("INVALID", "Journal entry debits and credits must balance.");
        await validateAccounts(tx, lines);
        const [period] = await tx.select().from(accountingPeriods).where(eq(accountingPeriods.id, entry.periodId)).limit(1);
        if (!period) throw new AccountingError("NOT_FOUND", "Accounting period not found.");
        if (period.status !== "open") throw new AccountingError("CONFLICT", "The accounting period is closed.");
        if (entry.entryDate < period.startsOn || entry.entryDate > period.endsOn) throw new AccountingError("INVALID", "The journal date must be inside the accounting period.");
        const allocated = await allocateNumber(tx, "journal_entry", "JE", new Date(`${entry.entryDate}T00:00:00.000Z`));
        const [updated] = await tx.update(journalEntries).set({ entryNumber: allocated.number, status: "posted", postedByUserId: actor.userId, postedAt: new Date(), updatedAt: new Date() }).where(and(eq(journalEntries.id, id), eq(journalEntries.status, "draft"))).returning();
        if (!updated) throw new AccountingError("CONFLICT", "The journal entry changed before it could be posted.");
        await tx.insert(auditLogs).values({ actorUserId: actor.userId, action: "journal_entry.post", resourceType: "journal_entry", resourceId: id, outcome: "success", correlationId: correlationId ?? null, metadata: { entryNumber: allocated.number, debitMinor: balance.debit.toString(), creditMinor: balance.credit.toString() } });
        await completeCommand(tx, claim.command.id, { journalEntryId: id, entryNumber: allocated.number });
        return { journalEntryId: id };
      });
      return (await getJournalEntry(result.journalEntryId))!;
    },

    async reverse(actor: AuthorizationActor, id: string, rawInput: unknown, idempotencyKeyHeader: string | null | undefined, correlationId?: string) {
      if (!can(actor, PERMISSIONS.ACCOUNTING_REVERSE)) throw new AccountingError("FORBIDDEN", "You cannot reverse journal entries.");
      const input = journalEntryReverseSchema.parse(rawInput);
      const idempotencyKey = requireIdempotencyKey(idempotencyKeyHeader);
      const current = await getJournalEntry(id);
      if (!current) throw new AccountingError("NOT_FOUND", "Journal entry not found.");
      const payload = { journalEntryId: id, ...input };
      const result = await db.transaction(async (tx) => {
        const claim = await claimCommand(tx, { operation: "accounting.journal-entry.reverse", idempotencyKey, payloadHash: hashAccountingPayload(payload), actorUserId: actor.userId, correlationId });
        if (claim.replayed) return claim.command.result as { journalEntryId: string };
        const [entry] = await tx.select().from(journalEntries).where(eq(journalEntries.id, id)).limit(1);
        const lines = await tx.select().from(journalEntryLines).where(eq(journalEntryLines.journalEntryId, id)).orderBy(journalEntryLines.position);
        if (!entry) throw new AccountingError("NOT_FOUND", "Journal entry not found.");
        if (entry.status !== "posted" || entry.reversalOfId) throw new AccountingError("CONFLICT", "Only a posted, unreversed journal entry can be reversed.");
        const [existingReversal] = await tx.select({ id: journalEntries.id }).from(journalEntries).where(eq(journalEntries.reversalOfId, id)).limit(1);
        if (existingReversal) throw new AccountingError("CONFLICT", "This journal entry has already been reversed.");
        const reversalDate = validDate(input.entryDate);
        const [period] = await tx.select().from(accountingPeriods).where(eq(accountingPeriods.id, input.periodId)).limit(1);
        if (!period) throw new AccountingError("NOT_FOUND", "Accounting period not found.");
        if (period.status !== "open") throw new AccountingError("CONFLICT", "The reversal accounting period is closed.");
        if (reversalDate < period.startsOn || reversalDate > period.endsOn) throw new AccountingError("INVALID", "The reversal date must be inside the selected accounting period.");
        const allocated = await allocateNumber(tx, "journal_entry", "JE", new Date(`${reversalDate}T00:00:00.000Z`));
        const [reversal] = await tx.insert(journalEntries).values({ entryNumber: allocated.number, entryDate: reversalDate, periodId: input.periodId, status: "posted", currencyCode: entry.currencyCode, memo: `Reversal of ${entry.entryNumber ?? entry.id}: ${input.reason}`, reversalOfId: id, reversalReason: input.reason, createdByUserId: actor.userId, postedByUserId: actor.userId, postedAt: new Date() }).returning();
        if (!reversal) throw new AccountingError("INVALID", "Reversal journal entry could not be created.");
        await tx.insert(journalEntryLines).values(lines.map((line, position) => ({ journalEntryId: reversal.id, position, accountId: line.accountId, description: `Reversal: ${line.description}`, debitMinor: line.creditMinor, creditMinor: line.debitMinor })));
        const originalSources = await tx.select().from(journalEntrySources).where(eq(journalEntrySources.journalEntryId, id));
        if (originalSources.length) await tx.insert(journalEntrySources).values(originalSources.map((source) => ({ journalEntryId: reversal.id, sourceType: source.sourceType, sourceId: source.sourceId, sourceAction: "reversed" as const, externalReference: source.externalReference, metadata: { ...source.metadata, reversalOfJournalEntryId: id, reason: input.reason } })));
        await tx.update(journalEntries).set({ status: "reversed", reversedByUserId: actor.userId, reversedAt: new Date(), updatedAt: new Date() }).where(and(eq(journalEntries.id, id), eq(journalEntries.status, "posted")));
        await tx.insert(auditLogs).values({ actorUserId: actor.userId, action: "journal_entry.reverse", resourceType: "journal_entry", resourceId: id, outcome: "success", correlationId: correlationId ?? null, metadata: { reversalJournalEntryId: reversal.id, reversalEntryNumber: allocated.number, reason: input.reason } });
        await completeCommand(tx, claim.command.id, { journalEntryId: reversal.id, entryNumber: allocated.number });
        return { journalEntryId: reversal.id };
      });
      return (await getJournalEntry(result.journalEntryId))!;
    },
  };
}
