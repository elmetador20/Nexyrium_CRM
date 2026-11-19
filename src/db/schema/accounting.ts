import { boolean, check, date, index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { clients, departments, users } from "./foundation";
import { documents } from "./documents";
import { projects } from "./projects";

export const expenseStatusEnum = pgEnum("expense_status", ["draft", "submitted", "approved", "rejected"]);
export const accountTypeEnum = pgEnum("accounting_account_type", ["asset", "liability", "equity", "revenue", "expense"]);
export const normalBalanceEnum = pgEnum("accounting_normal_balance", ["debit", "credit"]);
export const accountingPeriodStatusEnum = pgEnum("accounting_period_status", ["open", "closed"]);
export const journalEntryStatusEnum = pgEnum("journal_entry_status", ["draft", "posted", "reversed"]);
export const accountingSourceTypeEnum = pgEnum("accounting_source_type", ["expense", "invoice", "payment", "manual", "reconciliation"]);
export const accountingSourceActionEnum = pgEnum("accounting_source_action", ["posted", "reversed", "adjusted", "matched"]);
export const reconciliationStatusEnum = pgEnum("reconciliation_status", ["draft", "in_progress", "completed"]);
export const reconciliationItemStatusEnum = pgEnum("reconciliation_item_status", ["unmatched", "matched", "ignored"]);
export const reconciliationDirectionEnum = pgEnum("reconciliation_direction", ["debit", "credit"]);

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    category: varchar("category", { length: 120 }).notNull(),
    merchantName: varchar("merchant_name", { length: 200 }),
    description: text("description").notNull(),
    amountMinor: numeric("amount_minor", { precision: 20, scale: 0 }).notNull(),
    currencyCode: varchar("currency_code", { length: 3 }).notNull(),
    incurredOn: date("incurred_on").notNull(),
    status: expenseStatusEnum("status").default("draft").notNull(),
    departmentId: uuid("department_id").references(() => departments.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    submittedByUserId: uuid("submitted_by_user_id").references(() => users.id, { onDelete: "set null" }),
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id, { onDelete: "set null" }),
    approvalReason: text("approval_reason"),
    rejectedByUserId: uuid("rejected_by_user_id").references(() => users.id, { onDelete: "set null" }),
    rejectionReason: text("rejection_reason"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("expenses_amount_positive", sql`${table.amountMinor} > 0`),
    index("expenses_owner_status_idx").on(table.ownerId, table.status),
    index("expenses_department_status_idx").on(table.departmentId, table.status),
    index("expenses_incurred_on_idx").on(table.incurredOn),
    index("expenses_client_idx").on(table.clientId),
    index("expenses_project_idx").on(table.projectId),
  ],
);

export const expenseReceipts = pgTable(
  "expense_receipts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    expenseId: uuid("expense_id").notNull().references(() => expenses.id, { onDelete: "cascade" }),
    documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "restrict" }),
    uploadedByUserId: uuid("uploaded_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("expense_receipts_expense_document_unique").on(table.expenseId, table.documentId), index("expense_receipts_expense_idx").on(table.expenseId)],
);

export const accountingAccounts = pgTable(
  "accounting_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 30 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    accountType: accountTypeEnum("account_type").notNull(),
    normalBalance: normalBalanceEnum("normal_balance").notNull(),
    parentAccountId: uuid("parent_account_id"),
    isPostable: boolean("is_postable").default(true).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    description: text("description"),
    createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("accounting_accounts_code_unique").on(table.code), index("accounting_accounts_parent_idx").on(table.parentAccountId), index("accounting_accounts_active_idx").on(table.isActive)],
);

export const accountingPeriods = pgTable(
  "accounting_periods",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    periodKey: varchar("period_key", { length: 7 }).notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    status: accountingPeriodStatusEnum("status").default("open").notNull(),
    closedByUserId: uuid("closed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [check("accounting_periods_range_valid", sql`${table.endsOn} >= ${table.startsOn}`), uniqueIndex("accounting_periods_key_unique").on(table.periodKey), index("accounting_periods_status_idx").on(table.status, table.startsOn)],
);

export const journalEntries = pgTable(
  "journal_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    entryNumber: varchar("entry_number", { length: 60 }),
    entryDate: date("entry_date").notNull(),
    periodId: uuid("period_id").notNull().references(() => accountingPeriods.id, { onDelete: "restrict" }),
    status: journalEntryStatusEnum("status").default("draft").notNull(),
    currencyCode: varchar("currency_code", { length: 3 }).notNull(),
    memo: text("memo").notNull(),
    reversalOfId: uuid("reversal_of_id"),
    reversalReason: text("reversal_reason"),
    createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    postedByUserId: uuid("posted_by_user_id").references(() => users.id, { onDelete: "set null" }),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    reversedByUserId: uuid("reversed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    reversedAt: timestamp("reversed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("journal_entries_number_unique").on(table.entryNumber), uniqueIndex("journal_entries_reversal_unique").on(table.reversalOfId), index("journal_entries_period_status_idx").on(table.periodId, table.status), index("journal_entries_date_idx").on(table.entryDate), index("journal_entries_reversal_idx").on(table.reversalOfId)],
);

export const journalEntryLines = pgTable(
  "journal_entry_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    journalEntryId: uuid("journal_entry_id").notNull().references(() => journalEntries.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    accountId: uuid("account_id").notNull().references(() => accountingAccounts.id, { onDelete: "restrict" }),
    description: text("description").notNull(),
    debitMinor: numeric("debit_minor", { precision: 20, scale: 0 }).notNull(),
    creditMinor: numeric("credit_minor", { precision: 20, scale: 0 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("journal_entry_lines_debit_nonnegative", sql`${table.debitMinor} >= 0`),
    check("journal_entry_lines_credit_nonnegative", sql`${table.creditMinor} >= 0`),
    check("journal_entry_lines_one_side_only", sql`(${table.debitMinor} > 0 AND ${table.creditMinor} = 0) OR (${table.debitMinor} = 0 AND ${table.creditMinor} > 0)`),
    uniqueIndex("journal_entry_lines_entry_position_unique").on(table.journalEntryId, table.position),
    index("journal_entry_lines_account_idx").on(table.accountId),
  ],
);

export const journalEntrySources = pgTable(
  "journal_entry_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    journalEntryId: uuid("journal_entry_id").notNull().references(() => journalEntries.id, { onDelete: "cascade" }),
    sourceType: accountingSourceTypeEnum("source_type").notNull(),
    sourceId: varchar("source_id", { length: 100 }).notNull(),
    sourceAction: accountingSourceActionEnum("source_action").notNull(),
    externalReference: varchar("external_reference", { length: 255 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("journal_entry_sources_reference_unique").on(table.sourceType, table.sourceId, table.sourceAction, table.externalReference), index("journal_entry_sources_entry_idx").on(table.journalEntryId), index("journal_entry_sources_source_idx").on(table.sourceType, table.sourceId)],
);

export const accountingReconciliations = pgTable(
  "accounting_reconciliations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id").notNull().references(() => accountingAccounts.id, { onDelete: "restrict" }),
    periodId: uuid("period_id").notNull().references(() => accountingPeriods.id, { onDelete: "restrict" }),
    statementReference: varchar("statement_reference", { length: 255 }).notNull(),
    statementStartOn: date("statement_start_on").notNull(),
    statementEndOn: date("statement_end_on").notNull(),
    currencyCode: varchar("currency_code", { length: 3 }).notNull(),
    openingBalanceMinor: numeric("opening_balance_minor", { precision: 20, scale: 0 }).notNull(),
    closingBalanceMinor: numeric("closing_balance_minor", { precision: 20, scale: 0 }).notNull(),
    calculatedDifferenceMinor: numeric("calculated_difference_minor", { precision: 20, scale: 0 }).default("0").notNull(),
    status: reconciliationStatusEnum("status").default("draft").notNull(),
    createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    completedByUserId: uuid("completed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [check("accounting_reconciliations_date_range_valid", sql`${table.statementEndOn} >= ${table.statementStartOn}`), index("accounting_reconciliations_account_period_idx").on(table.accountId, table.periodId), index("accounting_reconciliations_status_idx").on(table.status)],
);

export const accountingReconciliationItems = pgTable(
  "accounting_reconciliation_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reconciliationId: uuid("reconciliation_id").notNull().references(() => accountingReconciliations.id, { onDelete: "cascade" }),
    externalTransactionId: varchar("external_transaction_id", { length: 255 }).notNull(),
    transactionOn: date("transaction_on").notNull(),
    description: text("description").notNull(),
    amountMinor: numeric("amount_minor", { precision: 20, scale: 0 }).notNull(),
    direction: reconciliationDirectionEnum("direction").notNull(),
    status: reconciliationItemStatusEnum("status").default("unmatched").notNull(),
    matchedJournalEntryLineId: uuid("matched_journal_entry_line_id").references(() => journalEntryLines.id, { onDelete: "set null" }),
    matchedByUserId: uuid("matched_by_user_id").references(() => users.id, { onDelete: "set null" }),
    matchedAt: timestamp("matched_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [check("accounting_reconciliation_items_amount_positive", sql`${table.amountMinor} > 0`), uniqueIndex("accounting_reconciliation_items_external_unique").on(table.reconciliationId, table.externalTransactionId), uniqueIndex("accounting_reconciliation_items_matched_line_unique").on(table.matchedJournalEntryLineId), index("accounting_reconciliation_items_reconciliation_idx").on(table.reconciliationId, table.status)],
);

export type Expense = typeof expenses.$inferSelect;
export type ExpenseReceipt = typeof expenseReceipts.$inferSelect;
export type AccountingAccount = typeof accountingAccounts.$inferSelect;
export type AccountingPeriod = typeof accountingPeriods.$inferSelect;
export type JournalEntry = typeof journalEntries.$inferSelect;
export type JournalEntryLine = typeof journalEntryLines.$inferSelect;
export type JournalEntrySource = typeof journalEntrySources.$inferSelect;
export type AccountingReconciliation = typeof accountingReconciliations.$inferSelect;
export type AccountingReconciliationItem = typeof accountingReconciliationItems.$inferSelect;
