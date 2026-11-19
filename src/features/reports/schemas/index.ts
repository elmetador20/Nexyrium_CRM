import { z } from "zod";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD dates.");
const listParam = z.union([z.string(), z.array(z.string())]).transform((value) => Array.isArray(value) ? value : value.split(",").map((item) => item.trim()).filter(Boolean));

export const reportFilterSchema = z.object({ periodFrom: dateSchema.optional(), periodTo: dateSchema.optional(), asOfDate: dateSchema.optional(), departmentIds: listParam.pipe(z.array(z.string().uuid())).optional(), currencyCodes: listParam.pipe(z.array(z.string().trim().length(3).transform((value) => value.toUpperCase()))).optional() });

export type ReportFilterInput = z.infer<typeof reportFilterSchema>;
