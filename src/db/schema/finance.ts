import { date, index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

import { clients, deals, departments, users } from "./foundation";
import { projects } from "./projects";

export const quotationStatusEnum = pgEnum("quotation_status", ["draft", "submitted", "approved", "rejected", "sent", "accepted", "expired", "canceled"]);
export const invoiceStatusEnum = pgEnum("invoice_status", ["draft", "issued", "partially_paid", "paid", "overdue", "voided"]);
export const paymentStatusEnum = pgEnum("payment_status", ["posted", "reversed", "refunded"]);
export const financeCommandStatusEnum = pgEnum("finance_command_status", ["processing", "completed", "failed"]);
export const financialArtifactStatusEnum = pgEnum("financial_artifact_status", ["pending", "available", "failed"]);

const moneyColumns = () => ({
  currencyCode: varchar("currency_code", { length: 3 }).notNull(),
  subtotalMinor: numeric("subtotal_minor", { precision: 20, scale: 0 }).notNull(),
  discountMinor: numeric("discount_minor", { precision: 20, scale: 0 }).notNull(),
  taxMinor: numeric("tax_minor", { precision: 20, scale: 0 }).notNull(),
  totalMinor: numeric("total_minor", { precision: 20, scale: 0 }).notNull(),
});

const scopeColumns = () => ({
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
  departmentId: uuid("department_id").references(() => departments.id, { onDelete: "set null" }),
});

export const financeNumberSequences = pgTable(
  "finance_number_sequences",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentType: varchar("document_type", { length: 30 }).notNull(),
    periodKey: varchar("period_key", { length: 10 }).notNull(),
    prefix: varchar("prefix", { length: 20 }).notNull(),
    nextValue: integer("next_value").default(1).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("finance_number_sequences_type_period_unique").on(table.documentType, table.periodKey)],
);

export const quotations = pgTable(
  "quotations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    quotationNumber: varchar("quotation_number", { length: 60 }),
    revision: integer("revision").default(0).notNull(),
    status: quotationStatusEnum("status").default("draft").notNull(),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "restrict" }),
    dealId: uuid("deal_id").references(() => deals.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    title: varchar("title", { length: 200 }).notNull(),
    notes: text("notes"),
    paymentTerms: text("payment_terms"),
    dueDate: date("due_date"),
    ...moneyColumns(),
    ...scopeColumns(),
    createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("quotations_number_unique").on(table.quotationNumber), index("quotations_client_status_idx").on(table.clientId, table.status), index("quotations_owner_status_idx").on(table.ownerId, table.status), index("quotations_project_idx").on(table.projectId)],
);

export const quotationLines = pgTable(
  "quotation_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    quotationId: uuid("quotation_id").notNull().references(() => quotations.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    description: text("description").notNull(),
    quantity: numeric("quantity", { precision: 18, scale: 6 }).notNull(),
    unitPriceMinor: numeric("unit_price_minor", { precision: 20, scale: 0 }).notNull(),
    discountBps: integer("discount_bps").default(0).notNull(),
    taxBps: integer("tax_bps").default(0).notNull(),
    lineSubtotalMinor: numeric("line_subtotal_minor", { precision: 20, scale: 0 }).notNull(),
    lineDiscountMinor: numeric("line_discount_minor", { precision: 20, scale: 0 }).notNull(),
    lineTaxMinor: numeric("line_tax_minor", { precision: 20, scale: 0 }).notNull(),
    lineTotalMinor: numeric("line_total_minor", { precision: 20, scale: 0 }).notNull(),
  },
  (table) => [index("quotation_lines_quotation_position_idx").on(table.quotationId, table.position)],
);

export const quotationVersions = pgTable(
  "quotation_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    quotationId: uuid("quotation_id").notNull().references(() => quotations.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
    snapshotHash: varchar("snapshot_hash", { length: 64 }).notNull(),
    rendererVersion: varchar("renderer_version", { length: 50 }),
    createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("quotation_versions_quotation_revision_unique").on(table.quotationId, table.revision), index("quotation_versions_hash_idx").on(table.snapshotHash)],
);

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    invoiceNumber: varchar("invoice_number", { length: 60 }),
    status: invoiceStatusEnum("status").default("draft").notNull(),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "restrict" }),
    dealId: uuid("deal_id").references(() => deals.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    quotationId: uuid("quotation_id").references(() => quotations.id, { onDelete: "set null" }),
    title: varchar("title", { length: 200 }).notNull(),
    notes: text("notes"),
    paymentTerms: text("payment_terms"),
    dueDate: date("due_date"),
    ...moneyColumns(),
    ...scopeColumns(),
    createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("invoices_number_unique").on(table.invoiceNumber), index("invoices_client_status_idx").on(table.clientId, table.status), index("invoices_owner_status_idx").on(table.ownerId, table.status), index("invoices_due_date_idx").on(table.dueDate)],
);

export const invoiceLines = pgTable(
  "invoice_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    description: text("description").notNull(),
    quantity: numeric("quantity", { precision: 18, scale: 6 }).notNull(),
    unitPriceMinor: numeric("unit_price_minor", { precision: 20, scale: 0 }).notNull(),
    discountBps: integer("discount_bps").default(0).notNull(),
    taxBps: integer("tax_bps").default(0).notNull(),
    lineSubtotalMinor: numeric("line_subtotal_minor", { precision: 20, scale: 0 }).notNull(),
    lineDiscountMinor: numeric("line_discount_minor", { precision: 20, scale: 0 }).notNull(),
    lineTaxMinor: numeric("line_tax_minor", { precision: 20, scale: 0 }).notNull(),
    lineTotalMinor: numeric("line_total_minor", { precision: 20, scale: 0 }).notNull(),
  },
  (table) => [index("invoice_lines_invoice_position_idx").on(table.invoiceId, table.position)],
);

export const invoiceVersions = pgTable(
  "invoice_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
    snapshotHash: varchar("snapshot_hash", { length: 64 }).notNull(),
    rendererVersion: varchar("renderer_version", { length: 50 }),
    createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("invoice_versions_invoice_unique").on(table.invoiceId), index("invoice_versions_hash_idx").on(table.snapshotHash)],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "restrict" }),
    amountMinor: numeric("amount_minor", { precision: 20, scale: 0 }).notNull(),
    currencyCode: varchar("currency_code", { length: 3 }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    paymentMethod: varchar("payment_method", { length: 50 }).notNull(),
    externalReference: varchar("external_reference", { length: 255 }),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
    status: paymentStatusEnum("status").default("posted").notNull(),
    ...scopeColumns(),
    createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("payments_idempotency_unique").on(table.idempotencyKey), uniqueIndex("payments_external_reference_unique").on(table.externalReference), index("payments_client_status_idx").on(table.clientId, table.status)],
);

export const paymentAllocations = pgTable(
  "payment_allocations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    paymentId: uuid("payment_id").notNull().references(() => payments.id, { onDelete: "restrict" }),
    invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "restrict" }),
    allocatedAmountMinor: numeric("allocated_amount_minor", { precision: 20, scale: 0 }).notNull(),
    allocatedAt: timestamp("allocated_at", { withTimezone: true }).defaultNow().notNull(),
    allocatedByUserId: uuid("allocated_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    reversalOfId: uuid("reversal_of_id"),
  },
  (table) => [index("payment_allocations_payment_idx").on(table.paymentId), index("payment_allocations_invoice_idx").on(table.invoiceId)],
);

export const financeCommands = pgTable(
  "finance_commands",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    operation: varchar("operation", { length: 80 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
    payloadHash: varchar("payload_hash", { length: 64 }).notNull(),
    status: financeCommandStatusEnum("status").default("processing").notNull(),
    resourceType: varchar("resource_type", { length: 80 }),
    resourceId: uuid("resource_id"),
    result: jsonb("result").$type<Record<string, unknown>>(),
    errorMessage: text("error_message"),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    correlationId: varchar("correlation_id", { length: 128 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("finance_commands_operation_key_unique").on(table.operation, table.idempotencyKey), index("finance_commands_status_idx").on(table.status, table.createdAt)],
);

export const financialArtifacts = pgTable(
  "financial_artifacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    quotationId: uuid("quotation_id").references(() => quotations.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "cascade" }),
    artifactType: varchar("artifact_type", { length: 30 }).notNull(),
    rendererVersion: varchar("renderer_version", { length: 50 }).notNull(),
    checksum: varchar("checksum", { length: 64 }).notNull(),
    provider: varchar("provider", { length: 50 }).notNull(),
    providerObjectId: varchar("provider_object_id", { length: 255 }).notNull(),
    filename: varchar("filename", { length: 255 }).notNull(),
    status: financialArtifactStatusEnum("status").default("pending").notNull(),
    createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("financial_artifacts_quotation_idx").on(table.quotationId), index("financial_artifacts_invoice_idx").on(table.invoiceId), uniqueIndex("financial_artifacts_checksum_unique").on(table.checksum)],
);

export type Quotation = typeof quotations.$inferSelect;
export type QuotationLine = typeof quotationLines.$inferSelect;
export type QuotationVersion = typeof quotationVersions.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type InvoiceLine = typeof invoiceLines.$inferSelect;
export type InvoiceVersion = typeof invoiceVersions.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type PaymentAllocation = typeof paymentAllocations.$inferSelect;
export type FinanceCommand = typeof financeCommands.$inferSelect;
export type FinancialArtifact = typeof financialArtifacts.$inferSelect;
