import { z } from "zod";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD dates.");
const currencySchema = z.string().trim().length(3).transform((value) => value.toUpperCase());
const amountSchema = z.string().regex(/^[1-9]\d*$/, "Amount must be a positive integer minor-unit string.");
const nonNegativeAmountSchema = z.string().regex(/^\d+$/, "Amount must be a non-negative integer minor-unit string.");
const signedAmountSchema = z.string().regex(/^-?\d+$/, "Amount must be an integer minor-unit string.");

export const expenseListSchema = z.object({ from:dateSchema.optional(), to:dateSchema.optional(), departmentId:z.string().uuid().optional(), search:z.string().trim().max(100).optional(), includedOnly:z.boolean().optional(), status: z.enum(["draft", "submitted", "approved", "rejected"]).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) });
export const expenseCreateSchema = z.object({ entryId: z.string().uuid().optional(), category: z.string().trim().min(1).max(120).optional().transform(v=>v ?? "Other"), merchantName: z.string().trim().max(200).optional().nullable(), description: z.string().trim().min(1).max(5000), amountMinor: amountSchema, currencyCode: currencySchema, incurredOn: dateSchema, departmentId: z.string().uuid().optional().nullable(), projectId: z.string().uuid().optional().nullable(), clientId: z.string().uuid().optional().nullable() });
export const expenseUpdateSchema = expenseCreateSchema.omit({entryId:true}).partial().extend({category:z.string().trim().min(1).max(120).optional()}).refine((value) => Object.keys(value).length > 0, "At least one expense field is required.");
export const expenseApproveSchema = z.object({ reason: z.string().trim().min(1).max(2000) });
export const expenseRejectSchema = z.object({ reason: z.string().trim().min(1).max(2000) });

export const accountListSchema = z.object({ activeOnly: z.coerce.boolean().default(true) });
export const accountCreateSchema = z.object({ code: z.string().trim().min(1).max(30).regex(/^[A-Za-z0-9._-]+$/), name: z.string().trim().min(1).max(160), accountType: z.enum(["asset", "liability", "equity", "revenue", "expense"]), normalBalance: z.enum(["debit", "credit"]), parentAccountId: z.string().uuid().optional().nullable(), isPostable: z.boolean().default(true), description: z.string().trim().max(2000).optional().nullable() });
export const accountUpdateSchema = z.object({ name: z.string().trim().min(1).max(160).optional(), isPostable: z.boolean().optional(), isActive: z.boolean().optional(), description: z.string().trim().max(2000).optional().nullable() }).refine((value) => Object.keys(value).length > 0, "At least one account field is required.");

export const periodListSchema = z.object({ status: z.enum(["open", "closed"]).optional() });
export const periodCreateSchema = z.object({ periodKey: z.string().regex(/^\d{4}-\d{2}$/), startsOn: dateSchema, endsOn: dateSchema });

const journalLineSchema = z.object({ accountId: z.string().uuid(), description: z.string().trim().min(1).max(2000), debitMinor: nonNegativeAmountSchema, creditMinor: nonNegativeAmountSchema }).refine((line) => (line.debitMinor !== "0") !== (line.creditMinor !== "0"), "Each line must have exactly one positive side.");
const sourceSchema = z.object({ sourceType: z.enum(["expense", "invoice", "payment", "manual", "reconciliation"]), sourceId: z.string().trim().min(1).max(100), sourceAction: z.enum(["posted", "reversed", "adjusted", "matched"]), externalReference: z.string().trim().max(255).optional().nullable(), metadata: z.record(z.string(), z.unknown()).default({}) });
export const journalEntryListSchema = z.object({ status: z.enum(["draft", "posted", "reversed"]).optional(), periodId: z.string().uuid().optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(50) });
export const journalEntryCreateSchema = z.object({ entryDate: dateSchema, periodId: z.string().uuid(), currencyCode: currencySchema, memo: z.string().trim().min(1).max(5000), lines: z.array(journalLineSchema).min(2).max(200), sources: z.array(sourceSchema).max(20).default([]) }).refine((value) => new Set(value.sources.map((source) => `${source.sourceType}:${source.sourceId}:${source.sourceAction}:${source.externalReference ?? ""}`)).size === value.sources.length, "Journal source references must be unique.");
export const journalEntryReverseSchema = z.object({ entryDate: dateSchema, periodId: z.string().uuid(), reason: z.string().trim().min(1).max(2000) });

export const reconciliationListSchema = z.object({ status: z.enum(["draft", "in_progress", "completed"]).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(50) });
export const reconciliationCreateSchema = z.object({ accountId: z.string().uuid(), periodId: z.string().uuid(), statementReference: z.string().trim().min(1).max(255), statementStartOn: dateSchema, statementEndOn: dateSchema, currencyCode: currencySchema, openingBalanceMinor: signedAmountSchema, closingBalanceMinor: signedAmountSchema });
export const reconciliationItemSchema = z.object({ externalTransactionId: z.string().trim().min(1).max(255), transactionOn: dateSchema, description: z.string().trim().min(1).max(2000), amountMinor: amountSchema, direction: z.enum(["debit", "credit"]), metadata: z.record(z.string(), z.unknown()).default({}) });
export const reconciliationMatchSchema = z.object({ itemId: z.string().uuid(), journalEntryLineId: z.string().uuid() });

export type ExpenseCreateInput = z.infer<typeof expenseCreateSchema>;
export type JournalEntryCreateInput = z.infer<typeof journalEntryCreateSchema>;
