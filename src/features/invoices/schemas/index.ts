import { z } from "zod";
import { currencyFractionDigits } from "@/features/finance/shared/money";

const optionalUuid = z.preprocess((value) => value === "" ? null : value, z.string().uuid().optional().nullable());
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD dates.").refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Use a valid calendar date.").transform((value) => new Date(`${value}T00:00:00.000Z`));
const optionalDate = z.preprocess((value) => value === "" ? null : value, dateOnly.optional().nullable());

const positiveQuantity = z.string()
  .regex(/^\d+(?:\.\d{1,6})?$/, "Quantity must be a positive number with up to six decimal places.")
  .refine((value) => {
    const [whole, fraction = ""] = value.split(".");
    return BigInt(whole) * BigInt(1_000_000) + BigInt(fraction.padEnd(6, "0")) > BigInt(0);
  }, "Quantity must be greater than zero.");

const positiveMinor = z.string().regex(/^[1-9]\d*$/, "Unit price must be a positive minor-unit amount.");

const currencyCode = z.string()
  .trim()
  .regex(/^[A-Za-z]{3}$/, "Currency must be a three-letter code.")
  .transform((value) => value.toUpperCase())
  .refine((value) => {
    try {
      currencyFractionDigits(value);
      return true;
    } catch {
      return false;
    }
  }, "Currency is not supported.");

const lineSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: positiveQuantity,
  unitPriceMinor: positiveMinor,
  discountBps: z.coerce.number().int().min(0).max(10000).default(0),
  taxBps: z.coerce.number().int().min(0).max(10000).default(0),
});

export const invoiceListSchema = z.object({
  status: z.enum(["draft", "issued", "partially_paid", "paid", "overdue", "voided", "outstanding"]).optional(),
  clientId: optionalUuid,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const invoiceClientListSchema = z.object({
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const invoiceCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(10_000).optional().nullable(),
  paymentTerms: z.string().trim().max(2_000).optional().nullable(),
  dueDate: optionalDate,
  currencyCode,
  clientId: z.string().uuid(),
  dealId: optionalUuid,
  projectId: optionalUuid,
  quotationId: optionalUuid,
  ownerId: optionalUuid,
  departmentId: optionalUuid,
  lines: z.array(lineSchema).min(1).max(200),
});

export const invoiceIssueSchema = z.object({ issue: z.literal(true) });
export const invoiceVoidSchema = z.object({ reason: z.string().trim().min(1).max(2_000) });
export const invoiceIdSchema = z.string().uuid();
export const invoiceActionSchema = z.object({
  action: z.enum(["issue", "void"]),
  input: z.unknown().optional(),
  reason: z.string().optional(),
}).superRefine((value, context) => {
  if (value.action === "void") {
    const reason = value.input && typeof value.input === "object" && "reason" in value.input ? value.input.reason : value.reason;
    if (typeof reason !== "string" || !reason.trim()) context.addIssue({ code: "custom", path: ["input", "reason"], message: "A void reason is required." });
  }
});

export type InvoiceCreateInput = z.infer<typeof invoiceCreateSchema>;
