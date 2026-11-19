import { and, eq, notInArray } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs, invoiceLines, invoiceVersions, invoices } from "@/db/schema";
import type { AuthorizationActor } from "@/lib/authorization/policy";
import { can } from "@/lib/authorization/policy";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { financeScope } from "@/features/finance/shared/scope";
import { FinanceError } from "@/features/finance/shared/errors";
import { allocateNumber, getInvoice, listFinanceClients, listInvoices } from "@/features/finance/shared/repository";
import { snapshotHash, validateFinanceLinks } from "@/features/finance/shared/validation";
import { ROLE_SLUGS } from "@/lib/authorization/roles";
import { buildInvoiceWrite } from "../persistence";
import { invoiceClientListSchema, invoiceCreateSchema, invoiceIdSchema, invoiceListSchema, invoiceVoidSchema } from "../schemas";

function resolveInvoiceAssignment(actor: AuthorizationActor, ownerId: string | null | undefined, departmentId: string | null | undefined) {
  const resolvedOwnerId = ownerId ?? actor.userId;
  const resolvedDepartmentId = departmentId ?? actor.departmentIds[0] ?? null;
  const privileged = actor.roles.some((role) => [ROLE_SLUGS.OWNER_ADMIN, ROLE_SLUGS.FOUNDER].includes(role as never));

  if (!privileged && resolvedOwnerId !== actor.userId && !actor.roles.includes(ROLE_SLUGS.DEPARTMENT_LEAD)) {
    throw new FinanceError("FORBIDDEN", "You cannot assign an invoice to another owner.");
  }
  if (!privileged && resolvedDepartmentId && !actor.departmentIds.includes(resolvedDepartmentId)) {
    throw new FinanceError("FORBIDDEN", "You cannot assign an invoice to another department.");
  }
  return { ownerId: resolvedOwnerId, departmentId: resolvedDepartmentId };
}

function buildSnapshot(invoice: typeof invoices.$inferSelect, lines: Array<typeof invoiceLines.$inferSelect>) {
  return { type: "invoice", id: invoice.id, number: invoice.invoiceNumber, title: invoice.title, notes: invoice.notes, paymentTerms: invoice.paymentTerms, dueDate: invoice.dueDate, clientId: invoice.clientId, dealId: invoice.dealId, projectId: invoice.projectId, quotationId: invoice.quotationId, currencyCode: invoice.currencyCode, subtotalMinor: invoice.subtotalMinor, discountMinor: invoice.discountMinor, taxMinor: invoice.taxMinor, totalMinor: invoice.totalMinor, lines } satisfies Record<string, unknown>;
}

export function createInvoiceService() {
  return {
    async list(actor: AuthorizationActor, rawInput: unknown) {
      if (!can(actor, PERMISSIONS.INVOICES_READ) && !can(actor, PERMISSIONS.FINANCE_READ)) throw new FinanceError("FORBIDDEN", "You cannot read invoices.");
      return listInvoices(invoiceListSchema.parse(rawInput), financeScope(actor));
    },
    async listClients(actor: AuthorizationActor, rawInput: unknown) {
      if (!can(actor, PERMISSIONS.INVOICES_CREATE) && !can(actor, PERMISSIONS.QUOTATIONS_CREATE) && !can(actor, PERMISSIONS.PAYMENTS_CREATE)) throw new FinanceError("FORBIDDEN", "You cannot select clients for financial documents.");
      return listFinanceClients(invoiceClientListSchema.parse(rawInput), financeScope(actor));
    },
    async get(actor: AuthorizationActor, id: string) {
      if (!can(actor, PERMISSIONS.INVOICES_READ)) throw new FinanceError("FORBIDDEN", "You cannot read invoices.");
      const invoiceId = invoiceIdSchema.parse(id);
      const result = await getInvoice(invoiceId, financeScope(actor));
      if (!result) throw new FinanceError("NOT_FOUND", "Invoice not found.");
      return result;
    },
    async create(actor: AuthorizationActor, rawInput: unknown, correlationId?: string) {
      if (!can(actor, PERMISSIONS.INVOICES_CREATE)) throw new FinanceError("FORBIDDEN", "You cannot create invoices.");
      const input = invoiceCreateSchema.parse(rawInput);
      const links = await validateFinanceLinks(actor, input);
      const assignment = resolveInvoiceAssignment(actor, input.ownerId, input.departmentId);
      const write = buildInvoiceWrite(input, actor, links.client.id, assignment);
      return db.transaction(async (tx) => {
        const [invoice] = await tx.insert(invoices).values(write.invoice).returning();
        if (!invoice) throw new FinanceError("INVALID", "Invoice could not be created.");
        await tx.insert(invoiceLines).values(write.lines(invoice.id));
        await tx.insert(auditLogs).values({ actorUserId: actor.userId, action: "invoice.create", resourceType: "invoice", resourceId: invoice.id, outcome: "success", correlationId: correlationId ?? null, metadata: { totalMinor: invoice.totalMinor, currencyCode: invoice.currencyCode } });
        return invoice;
      });
    },
    async issue(actor: AuthorizationActor, id: string, correlationId?: string) {
      if (!can(actor, PERMISSIONS.INVOICES_ISSUE)) throw new FinanceError("FORBIDDEN", "You cannot issue invoices.");
      const invoiceId = invoiceIdSchema.parse(id);
      const current = await getInvoice(invoiceId, financeScope(actor));
      if (!current) throw new FinanceError("NOT_FOUND", "Invoice not found.");
      if (current.invoice.status !== "draft") throw new FinanceError("CONFLICT", "Only draft invoices can be issued.");
      const issued = await db.transaction(async (tx) => {
        const issuedAt = new Date();
        const allocated = await allocateNumber(tx, "invoice", "INV", issuedAt);
        const [updated] = await tx.update(invoices).set({ invoiceNumber: allocated.number, status: "issued", issuedAt, updatedAt: new Date() }).where(and(eq(invoices.id, invoiceId), eq(invoices.status, "draft"))).returning();
        if (!updated) throw new FinanceError("CONFLICT", "The invoice changed before it could be issued.");
        const snapshot = buildSnapshot(updated, current.lines);
        await tx.insert(invoiceVersions).values({ invoiceId, snapshot, snapshotHash: snapshotHash(snapshot), createdByUserId: actor.userId });
        await tx.insert(auditLogs).values({ actorUserId: actor.userId, action: "invoice.issue", resourceType: "invoice", resourceId: invoiceId, outcome: "success", correlationId: correlationId ?? null, metadata: { invoiceNumber: allocated.number, totalMinor: updated.totalMinor } });
        return updated;
      });
      return issued;
    },
    async void(actor: AuthorizationActor, id: string, reason: string, correlationId?: string) {
      if (!can(actor, PERMISSIONS.INVOICES_VOID)) throw new FinanceError("FORBIDDEN", "You cannot void invoices.");
      const invoiceId = invoiceIdSchema.parse(id);
      const input = invoiceVoidSchema.parse({ reason });
      const current = await getInvoice(invoiceId, financeScope(actor));
      if (!current) throw new FinanceError("NOT_FOUND", "Invoice not found.");
      if (["paid", "voided"].includes(current.invoice.status)) throw new FinanceError("CONFLICT", "This invoice cannot be voided.");
      const voided = await db.transaction(async (tx) => {
        const [updated] = await tx.update(invoices).set({ status: "voided", voidedAt: new Date(), updatedAt: new Date() }).where(and(eq(invoices.id, invoiceId), notInArray(invoices.status, ["paid", "voided"]))).returning();
        if (!updated) throw new FinanceError("CONFLICT", "The invoice changed before it could be voided.");
        await tx.insert(auditLogs).values({ actorUserId: actor.userId, action: "invoice.void", resourceType: "invoice", resourceId: invoiceId, outcome: "success", correlationId: correlationId ?? null, metadata: { reason: input.reason } });
        return updated;
      });
      return voided;
    },
  };
}
