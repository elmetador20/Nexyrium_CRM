import { z } from "zod";
import { acquisitionSourceSchema } from "@/features/crm/leads/acquisition-source-schema";

import { LEAD_STATUSES } from "@/types/crm";

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();
const optionalUuid = z.string().uuid().optional().nullable();

export const leadCreateSchema = z.object({
  contactName: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320).optional().nullable().or(z.literal("")),
  phone: z.string().trim().max(40).optional().nullable().or(z.literal("")),
  companyName: optionalText(200),
  source: z.string().trim().min(1).max(100),
  acquisitionSource: acquisitionSourceSchema,
  sourceDetails: optionalText(2_000),
  status: z.enum(LEAD_STATUSES).default("new"),
  ownerId: optionalUuid,
  departmentId: optionalUuid,
  notes: optionalText(10_000),
  nextAction: optionalText(500),
  nextActionAt: z.coerce.date().optional().nullable(),
});

/** Records created by people in the CRM must carry a company and a phone number. */
export const leadManualCreateSchema = leadCreateSchema.extend({
  companyName: z.string().trim().min(1, "Enter the company name.").max(200),
  phone: z.string().trim().min(1, "Enter a phone number.").max(40),
});

export const leadUpdateSchema = leadCreateSchema.partial().extend({
  status: z.enum(LEAD_STATUSES).optional(),
});

export const leadListSchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(LEAD_STATUSES).optional(),
  source: z.string().trim().max(100).optional(),
  acquisitionSource: acquisitionSourceSchema,
  departmentId: z.preprocess((value) => value === "" ? undefined : value, z.string().uuid().optional()),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const leadActivitySchema = z.object({
  type: z.string().trim().min(1).max(50),
  content: z.string().trim().min(1).max(10_000),
  occurredAt: z.coerce.date().optional(),
});

export const leadConversionSchema = z.object({
  // A converted lead becomes a client, so it follows the client rules: name, company and phone.
  client: z.object({
    name: z.string().trim().min(1).max(200),
    companyName: z.string().trim().min(1, "Enter the company name.").max(200),
    email: z.string().trim().email().max(320).optional().or(z.literal("")),
    phone: z.string().trim().min(1, "Enter a phone number.").max(40),
    website: z.string().trim().url().max(500).optional().or(z.literal("")),
    notes: optionalText(10_000),
  }),
  deal: z.object({
    title: z.string().trim().min(1).max(200),
    expectedValue: z.coerce.number().finite().min(0),
    currency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
    expectedCloseDate: z.coerce.date().optional().nullable(),
    notes: optionalText(10_000),
  }),
});

export type LeadCreateInput = z.infer<typeof leadCreateSchema>;
export type LeadUpdateInput = z.infer<typeof leadUpdateSchema>;
export type LeadListInput = z.infer<typeof leadListSchema>;
export type LeadActivityInput = z.infer<typeof leadActivitySchema>;
export type LeadConversionInput = z.infer<typeof leadConversionSchema>;
