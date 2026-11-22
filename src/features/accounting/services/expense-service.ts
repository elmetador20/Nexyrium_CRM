import { notifyExpense } from "@/features/notifications/expense-events";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs, expenses } from "@/db/schema";
import type { AuthorizationActor } from "@/lib/authorization/policy";
import { can } from "@/lib/authorization/policy";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { findClient, findProject } from "@/features/finance/shared/repository";
import { expenseScope } from "../scope";
import { AccountingError } from "../errors";
import { expenseApproveSchema, expenseCreateSchema, expenseListSchema, expenseRejectSchema, expenseUpdateSchema } from "../schemas";
import { getExpense, listExpenses } from "../queries";

function assertDateRange(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new AccountingError("INVALID", "Use a valid YYYY-MM-DD expense date.");
  return value;
}

async function validateLinks(actor: AuthorizationActor, input: { clientId?: string | null; projectId?: string | null; departmentId?: string | null }) {
  const scope = expenseScope(actor);
  if (input.departmentId && scope.kind === "department" && !scope.departmentIds.includes(input.departmentId)) throw new AccountingError("FORBIDDEN", "You cannot assign an expense to another department.");
  if (input.departmentId && scope.kind === "owner" && !actor.departmentIds.includes(input.departmentId)) throw new AccountingError("FORBIDDEN", "You can only assign an expense to one of your departments.");
  const client = input.clientId ? await findClient(input.clientId, scope) : null;
  if (input.clientId && !client) throw new AccountingError("NOT_FOUND", "Client not found.");
  const project = input.projectId ? await findProject(input.projectId, scope) : null;
  if (input.projectId && !project) throw new AccountingError("NOT_FOUND", "Project not found.");
  if (project?.clientId && input.clientId && project.clientId !== input.clientId) throw new AccountingError("CONFLICT", "The selected project belongs to another client.");
  return { client, project };
}

function canSelfApprove(actor: AuthorizationActor) {
  return can(actor, PERMISSIONS.EXPENSES_APPROVE_OWN);
}

export function createExpenseService() {
  return {
    async list(actor: AuthorizationActor, rawInput: unknown) {
      if (!can(actor, PERMISSIONS.EXPENSES_READ)) throw new AccountingError("FORBIDDEN", "You cannot read expenses.");
      return listExpenses(expenseListSchema.parse(rawInput), expenseScope(actor));
    },

    async get(actor: AuthorizationActor, id: string) {
      if (!can(actor, PERMISSIONS.EXPENSES_READ)) throw new AccountingError("FORBIDDEN", "You cannot read expenses.");
      const result = await getExpense(id, expenseScope(actor));
      if (!result) throw new AccountingError("NOT_FOUND", "Expense not found.");
      return { ...result, receipts: result.receipts.map(({ relation, document, storage }) => ({ ...relation, document: { id: document.id, title: document.title, originalFilename: document.originalFilename, mimeType: document.mimeType, sizeBytes: document.sizeBytes, status: document.status, createdAt: document.createdAt, contentUrl: `/api/v1/expenses/${id}/receipts/${document.id}/content`, driveUrl: typeof storage?.providerMetadata?.webViewLink === "string" && storage.providerMetadata.webViewLink.startsWith("https://") ? storage.providerMetadata.webViewLink : null }, storageStatus: storage?.status ?? null })) };
    },

    async create(actor: AuthorizationActor, rawInput: unknown, correlationId?: string) {
      if (!can(actor, PERMISSIONS.EXPENSES_CREATE)) throw new AccountingError("FORBIDDEN", "You cannot create expenses.");
      const input = expenseCreateSchema.parse(rawInput);
      await validateLinks(actor, input);
      const incurredOn = assertDateRange(input.incurredOn);
      const departmentId = input.departmentId ?? actor.departmentIds[0] ?? null;
      const [expense] = await db.transaction(async (tx) => {
        const [created] = await tx.insert(expenses).values({ id: input.entryId, category: input.category, merchantName: input.merchantName ?? null, description: input.description, amountMinor: input.amountMinor, currencyCode: input.currencyCode, incurredOn, departmentId, projectId: input.projectId ?? null, clientId: input.clientId ?? null, ownerId: actor.userId, createdByUserId: actor.userId }).onConflictDoNothing({target:expenses.id}).returning();
        if (!created && input.entryId) {
          const [prior] = await tx.select().from(expenses).where(and(eq(expenses.id,input.entryId),eq(expenses.createdByUserId,actor.userId)));
          if (prior && prior.amountMinor === input.amountMinor && prior.currencyCode === input.currencyCode &&
              prior.description === input.description && prior.category === input.category && prior.incurredOn === incurredOn &&
              prior.merchantName === (input.merchantName ?? null) && prior.departmentId === departmentId &&
              prior.clientId === (input.clientId ?? null) && prior.projectId === (input.projectId ?? null)) return [prior] as const;
          throw new AccountingError("CONFLICT", "Check the existing expense before creating another entry.");
        }
        if (!created) throw new AccountingError("INVALID", "Expense could not be created.");
        await tx.insert(auditLogs).values({ actorUserId: actor.userId, action: "expense.create", resourceType: "expense", resourceId: created.id, outcome: "success", correlationId: correlationId ?? null, metadata: { amountMinor: created.amountMinor, currencyCode: created.currencyCode, category: created.category } });
        return [created] as const;
      });
      return expense;
    },

    async update(actor: AuthorizationActor, id: string, rawInput: unknown, correlationId?: string) {
      if (!can(actor, PERMISSIONS.EXPENSES_UPDATE)) throw new AccountingError("FORBIDDEN", "You cannot update expenses.");
      const current = await getExpense(id, expenseScope(actor));
      if (!current) throw new AccountingError("NOT_FOUND", "Expense not found.");
      if (current.expense.status !== "draft") throw new AccountingError("CONFLICT", "Only draft expenses can be edited.");
      const input = expenseUpdateSchema.parse(rawInput);
      await validateLinks(actor, input);
      const [updated] = await db.transaction(async (tx) => {
        const [record] = await tx.update(expenses).set({ ...input, incurredOn: input.incurredOn ? assertDateRange(input.incurredOn) : undefined, merchantName: input.merchantName === undefined ? undefined : input.merchantName ?? null, departmentId: input.departmentId === undefined ? undefined : input.departmentId ?? null, projectId: input.projectId === undefined ? undefined : input.projectId ?? null, clientId: input.clientId === undefined ? undefined : input.clientId ?? null, updatedAt: new Date() }).where(and(eq(expenses.id, id), eq(expenses.status, "draft"))).returning();
        if (!record) throw new AccountingError("NOT_FOUND", "Expense not found.");
        await tx.insert(auditLogs).values({ actorUserId: actor.userId, action: "expense.update", resourceType: "expense", resourceId: id, outcome: "success", correlationId: correlationId ?? null, metadata: { changedFields: Object.keys(input) } });
        return [record] as const;
      });
      return updated;
    },

    async submit(actor: AuthorizationActor, id: string, correlationId?: string) {
      if (!can(actor, PERMISSIONS.EXPENSES_SUBMIT)) throw new AccountingError("FORBIDDEN", "You cannot submit expenses.");
      const current = await getExpense(id, expenseScope(actor));
      if (!current) throw new AccountingError("NOT_FOUND", "Expense not found.");
      if (current.expense.ownerId !== actor.userId && !can(actor, PERMISSIONS.EXPENSES_APPROVE)) throw new AccountingError("FORBIDDEN", "Only the submitter or an authorized approver can submit this expense.");
      if (current.expense.status !== "draft") throw new AccountingError("CONFLICT", "Only draft expenses can be submitted.");
      const [updated] = await db.transaction(async (tx) => {
        const [record] = await tx.update(expenses).set({ status: "submitted", submittedByUserId: actor.userId, submittedAt: new Date(), updatedAt: new Date() }).where(and(eq(expenses.id, id), eq(expenses.status, "draft"))).returning();
        if (!record) throw new AccountingError("CONFLICT", "The expense changed before it could be submitted.");
        await tx.insert(auditLogs).values({ actorUserId: actor.userId, action: "expense.submit", resourceType: "expense", resourceId: id, outcome: "success", correlationId: correlationId ?? null });
        await notifyExpense(tx, record, actor.userId);
        return [record] as const;
      });
      return updated;
    },

    async approve(actor: AuthorizationActor, id: string, rawInput: unknown, correlationId?: string) {
      if (!can(actor, PERMISSIONS.EXPENSES_APPROVE)) throw new AccountingError("FORBIDDEN", "You cannot approve expenses.");
      const input = expenseApproveSchema.parse(rawInput);
      const current = await getExpense(id, expenseScope(actor));
      if (!current) throw new AccountingError("NOT_FOUND", "Expense not found.");
      if (current.expense.submittedByUserId === actor.userId && !canSelfApprove(actor)) throw new AccountingError("FORBIDDEN", "You cannot approve your own expense.");
      if (current.expense.status !== "submitted") throw new AccountingError("CONFLICT", "Only submitted expenses can be approved.");
      const [updated] = await db.transaction(async (tx) => {
        const [record] = await tx.update(expenses).set({ status: "approved", approvedByUserId: actor.userId, approvalReason: input.reason, approvedAt: new Date(), updatedAt: new Date() }).where(and(eq(expenses.id, id), eq(expenses.status, "submitted"))).returning();
        if (!record) throw new AccountingError("CONFLICT", "The expense changed before it could be approved.");
        await tx.insert(auditLogs).values({ actorUserId: actor.userId, action: "expense.approve", resourceType: "expense", resourceId: id, outcome: "success", correlationId: correlationId ?? null, metadata: { reason: input.reason, submittedByUserId: current.expense.submittedByUserId } });
        await notifyExpense(tx, record, actor.userId);
        return [record] as const;
      });
      return updated;
    },

    async reject(actor: AuthorizationActor, id: string, rawInput: unknown, correlationId?: string) {
      if (!can(actor, PERMISSIONS.EXPENSES_REJECT)) throw new AccountingError("FORBIDDEN", "You cannot reject expenses.");
      const input = expenseRejectSchema.parse(rawInput);
      const current = await getExpense(id, expenseScope(actor));
      if (!current) throw new AccountingError("NOT_FOUND", "Expense not found.");
      if (current.expense.submittedByUserId === actor.userId && !canSelfApprove(actor)) throw new AccountingError("FORBIDDEN", "You cannot reject your own expense.");
      if (current.expense.status !== "submitted") throw new AccountingError("CONFLICT", "Only submitted expenses can be rejected.");
      const [updated] = await db.transaction(async (tx) => {
        const [record] = await tx.update(expenses).set({ status: "rejected", rejectedByUserId: actor.userId, rejectionReason: input.reason, rejectedAt: new Date(), updatedAt: new Date() }).where(and(eq(expenses.id, id), eq(expenses.status, "submitted"))).returning();
        if (!record) throw new AccountingError("CONFLICT", "The expense changed before it could be rejected.");
        await tx.insert(auditLogs).values({ actorUserId: actor.userId, action: "expense.reject", resourceType: "expense", resourceId: id, outcome: "success", correlationId: correlationId ?? null, metadata: { reason: input.reason, submittedByUserId: current.expense.submittedByUserId } });
        await notifyExpense(tx, record, actor.userId);
        return [record] as const;
      });
      return updated;
    },
  };
}
