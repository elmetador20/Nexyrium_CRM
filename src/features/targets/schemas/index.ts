import { z } from "zod";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD dates.");
export const targetMetricKeys = ["payments_received_minor", "invoices_issued_minor", "leads_created", "tasks_completed"] as const;
const targetValueSchema = z.object({ unit: z.enum(["count", "minor_amount"]), targetCount: z.number().int().min(0).optional().nullable(), targetMinor: z.string().regex(/^\d+$/).optional().nullable(), currencyCode: z.string().trim().length(3).transform((value) => value.toUpperCase()).optional().nullable() }).superRefine((value, context) => {
  if (value.unit === "count" && (value.targetCount === null || value.targetCount === undefined || value.targetMinor !== null && value.targetMinor !== undefined || value.currencyCode !== null && value.currencyCode !== undefined)) context.addIssue({ code: "custom", message: "Count targets require targetCount and no amount or currency." });
  if (value.unit === "minor_amount" && (value.targetMinor === null || value.targetMinor === undefined || value.currencyCode === null || value.currencyCode === undefined || value.targetCount !== null && value.targetCount !== undefined)) context.addIssue({ code: "custom", message: "Amount targets require targetMinor and currency." });
});

export const targetListSchema = z.object({ periodStart: dateSchema.optional(), periodEnd: dateSchema.optional(), departmentId: z.string().uuid().optional() });
export const targetCreateSchema = z.object({ departmentId: z.string().uuid(), metricKey: z.enum(targetMetricKeys), periodStart: dateSchema, periodEnd: dateSchema }).and(targetValueSchema);
export const targetUpdateSchema = z.object({ periodStart: dateSchema.optional(), periodEnd: dateSchema.optional(), metricKey: z.enum(targetMetricKeys).optional() }).and(targetValueSchema);

export type TargetCreateInput = z.infer<typeof targetCreateSchema>;
export type TargetListInput = z.infer<typeof targetListSchema>;
