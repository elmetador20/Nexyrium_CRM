import { z } from "zod";
import { currencyFractionDigits } from "@/features/finance/shared/money";

const optionalUuid = z.preprocess((value) => value === "" ? null : value, z.string().uuid().optional().nullable());
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD dates.").refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Use a valid calendar date.").transform((value) => new Date(`${value}T00:00:00.000Z`));
const optionalDate = z.preprocess((value) => value === "" ? null : value, dateOnly.optional().nullable());
const positiveQuantity = z.string().regex(/^\d+(?:\.\d{1,6})?$/, "Quantity must be a positive number with up to six decimal places.").refine((value) => { const [whole, fraction = ""] = value.split("."); return BigInt(whole) * BigInt(1_000_000) + BigInt(fraction.padEnd(6, "0")) > BigInt(0); }, "Quantity must be greater than zero.");
const positiveMinor = z.string().regex(/^[1-9]\d*$/, "Unit price must be a positive minor-unit amount.");
const currencyCode = z.string().trim().regex(/^[A-Za-z]{3}$/, "Currency must be a three-letter code.").transform((value) => value.toUpperCase()).refine((value) => { try { currencyFractionDigits(value); return true; } catch { return false; } }, "Currency is not supported.");

const lineSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: positiveQuantity,
  unitPriceMinor: positiveMinor,
  discountBps: z.coerce.number().int().min(0).max(10000).default(0),
  taxBps: z.coerce.number().int().min(0).max(10000).default(0),
});

export const quotationListSchema = z.object({
  status: z.enum(["draft", "submitted", "approved", "rejected", "sent", "accepted", "expired", "canceled"]).optional(),
  clientId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const quotationCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(10_000).optional().nullable(),
  paymentTerms: z.string().trim().max(2_000).optional().nullable(),
  dueDate: optionalDate,
  currencyCode,
  clientId: z.string().uuid(),
  dealId: optionalUuid,
  projectId: optionalUuid,
  ownerId: optionalUuid,
  departmentId: optionalUuid,
  lines: z.array(lineSchema).min(1).max(200),
});

export const quotationTransitionSchema = z.object({ status: z.enum(["submitted", "approved", "rejected", "sent", "accepted", "expired", "canceled"]) });
export const quotationRevisionSchema = quotationCreateSchema;
export const quotationIdSchema = z.string().uuid();

export type QuotationCreateInput = z.infer<typeof quotationCreateSchema>;
