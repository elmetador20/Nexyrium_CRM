import { and, count, eq } from "drizzle-orm";

import { db } from "@/db";
import { accountingAccounts, accountingPeriods, auditLogs, journalEntries } from "@/db/schema";
import type { AuthorizationActor } from "@/lib/authorization/policy";
import { can } from "@/lib/authorization/policy";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { AccountingError } from "../errors";
import { accountCreateSchema, accountListSchema, accountUpdateSchema, periodCreateSchema, periodListSchema } from "../schemas";
import { getAccount, getPeriod, listAccounts, listPeriods } from "../queries";

function assertCalendarPeriod(input: { periodKey: string; startsOn: string; endsOn: string }) {
  const start = new Date(`${input.startsOn}T00:00:00.000Z`);
  const end = new Date(`${input.endsOn}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || input.startsOn.slice(0, 7) !== input.periodKey || input.endsOn.slice(0, 7) !== input.periodKey || end < start) throw new AccountingError("INVALID", "Accounting periods must be valid calendar months.");
}

export function createAccountingAdminService() {
  return {
    async listAccounts(actor: AuthorizationActor, rawInput: unknown) {
      if (!can(actor, PERMISSIONS.ACCOUNTING_READ)) throw new AccountingError("FORBIDDEN", "You cannot read accounting accounts.");
      return listAccounts(accountListSchema.parse(rawInput).activeOnly);
    },

    async createAccount(actor: AuthorizationActor, rawInput: unknown, correlationId?: string) {
      if (!can(actor, PERMISSIONS.ACCOUNTING_MANAGE)) throw new AccountingError("FORBIDDEN", "You cannot manage accounting accounts.");
      const input = accountCreateSchema.parse(rawInput);
      if (input.parentAccountId) {
        const parent = await getAccount(input.parentAccountId);
        if (!parent) throw new AccountingError("NOT_FOUND", "Parent accounting account not found.");
      }
      const [account] = await db.transaction(async (tx) => {
        const [created] = await tx.insert(accountingAccounts).values({ code: input.code, name: input.name, accountType: input.accountType, normalBalance: input.normalBalance, parentAccountId: input.parentAccountId ?? null, isPostable: input.isPostable, description: input.description ?? null, createdByUserId: actor.userId }).returning();
        if (!created) throw new AccountingError("INVALID", "Accounting account could not be created.");
        await tx.insert(auditLogs).values({ actorUserId: actor.userId, action: "account.create", resourceType: "accounting_account", resourceId: created.id, outcome: "success", correlationId: correlationId ?? null, metadata: { code: created.code, accountType: created.accountType } });
        return [created] as const;
      });
      return account;
    },

    async updateAccount(actor: AuthorizationActor, id: string, rawInput: unknown, correlationId?: string) {
      if (!can(actor, PERMISSIONS.ACCOUNTING_MANAGE)) throw new AccountingError("FORBIDDEN", "You cannot manage accounting accounts.");
      const input = accountUpdateSchema.parse(rawInput);
      const current = await getAccount(id);
      if (!current) throw new AccountingError("NOT_FOUND", "Accounting account not found.");
      const [updated] = await db.transaction(async (tx) => {
        const [record] = await tx.update(accountingAccounts).set({ ...input, description: input.description === undefined ? undefined : input.description ?? null, updatedAt: new Date() }).where(eq(accountingAccounts.id, id)).returning();
        if (!record) throw new AccountingError("NOT_FOUND", "Accounting account not found.");
        await tx.insert(auditLogs).values({ actorUserId: actor.userId, action: record.isActive ? "account.update" : "account.deactivate", resourceType: "accounting_account", resourceId: id, outcome: "success", correlationId: correlationId ?? null, metadata: { changedFields: Object.keys(input), code: current.code } });
        return [record] as const;
      });
      return updated;
    },

    async listPeriods(actor: AuthorizationActor, rawInput: unknown) {
      if (!can(actor, PERMISSIONS.ACCOUNTING_READ)) throw new AccountingError("FORBIDDEN", "You cannot read accounting periods.");
      return listPeriods(periodListSchema.parse(rawInput).status);
    },

    async createPeriod(actor: AuthorizationActor, rawInput: unknown, correlationId?: string) {
      if (!can(actor, PERMISSIONS.ACCOUNTING_MANAGE)) throw new AccountingError("FORBIDDEN", "You cannot manage accounting periods.");
      const input = periodCreateSchema.parse(rawInput);
      assertCalendarPeriod(input);
      const [period] = await db.transaction(async (tx) => {
        const [created] = await tx.insert(accountingPeriods).values({ periodKey: input.periodKey, startsOn: input.startsOn, endsOn: input.endsOn, createdByUserId: actor.userId }).returning();
        if (!created) throw new AccountingError("INVALID", "Accounting period could not be created.");
        await tx.insert(auditLogs).values({ actorUserId: actor.userId, action: "period.create", resourceType: "accounting_period", resourceId: created.id, outcome: "success", correlationId: correlationId ?? null, metadata: { periodKey: created.periodKey } });
        return [created] as const;
      });
      return period;
    },

    async closePeriod(actor: AuthorizationActor, id: string, correlationId?: string) {
      if (!can(actor, PERMISSIONS.ACCOUNTING_PERIOD_CLOSE)) throw new AccountingError("FORBIDDEN", "You cannot close accounting periods.");
      const current = await getPeriod(id);
      if (!current) throw new AccountingError("NOT_FOUND", "Accounting period not found.");
      if (current.status !== "open") throw new AccountingError("CONFLICT", "The accounting period is already closed.");
      const [{ draftCount }] = await db.select({ draftCount: count() }).from(journalEntries).where(and(eq(journalEntries.periodId, id), eq(journalEntries.status, "draft")));
      if (Number(draftCount) > 0) throw new AccountingError("CONFLICT", "Draft journal entries must be resolved before closing the period.");
      const [period] = await db.transaction(async (tx) => {
        const [updated] = await tx.update(accountingPeriods).set({ status: "closed", closedByUserId: actor.userId, closedAt: new Date(), updatedAt: new Date() }).where(and(eq(accountingPeriods.id, id), eq(accountingPeriods.status, "open"))).returning();
        if (!updated) throw new AccountingError("CONFLICT", "The accounting period changed before it could be closed.");
        await tx.insert(auditLogs).values({ actorUserId: actor.userId, action: "period.close", resourceType: "accounting_period", resourceId: id, outcome: "success", correlationId: correlationId ?? null, metadata: { periodKey: updated.periodKey } });
        return [updated] as const;
      });
      return period;
    },
  };
}
