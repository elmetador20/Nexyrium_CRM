import { z } from "zod";

import { DEAL_STAGES } from "@/types/crm";

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();
const optionalUuid = z.string().uuid().optional().nullable();

export const dealCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  stage: z.enum(DEAL_STAGES).default("prospecting"),
  expectedValue: z.coerce.number().finite().min(0),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  expectedCloseDate: z.coerce.date().optional().nullable(),
  ownerId: optionalUuid,
  departmentId: optionalUuid,
  clientId: optionalUuid,
  leadId: optionalUuid,
  notes: optionalText(10_000),
});

export const dealUpdateSchema = dealCreateSchema.partial();

export const dealListSchema = z.object({
  search: z.string().trim().max(100).optional(),
  stage: z.enum(DEAL_STAGES).optional(),
  departmentId: z.preprocess((value) => value === "" ? undefined : value, z.string().uuid().optional()),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type DealCreateInput = z.infer<typeof dealCreateSchema>;
export type DealUpdateInput = z.infer<typeof dealUpdateSchema>;
export type DealListInput = z.infer<typeof dealListSchema>;
