import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();
const optionalUuid = z.string().uuid().optional().nullable();

const contactSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  jobTitle: optionalText(150),
  isPrimary: z.boolean().default(false),
});

export const clientCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  companyName: optionalText(200),
  email: z.string().trim().email().max(320).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  website: z.string().trim().url().max(500).optional().or(z.literal("")),
  ownerId: optionalUuid,
  departmentId: optionalUuid,
  notes: optionalText(10_000),
  contacts: z.array(contactSchema).max(50).default([]),
});

export const clientUpdateSchema = clientCreateSchema.partial().extend({
  contacts: z.array(contactSchema).max(50).optional(),
});

export const clientListSchema = z.object({
  search: z.string().trim().max(100).optional(),
  departmentId: z.preprocess((value) => value === "" ? undefined : value, z.string().uuid().optional()),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ClientCreateInput = z.infer<typeof clientCreateSchema>;
export type ClientUpdateInput = z.infer<typeof clientUpdateSchema>;
export type ClientListInput = z.infer<typeof clientListSchema>;
