import { z } from "zod";

import { PROJECT_STATUSES } from "@/types/projects";

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();
const optionalUuid = z.string().uuid().optional().nullable();
const optionalDate = z.coerce.date().optional().nullable();

export const projectListSchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  clientId: z.string().uuid().optional(),
  dealId: z.string().uuid().optional(),
  ownerId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const projectCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: optionalText(10_000),
  status: z.enum(PROJECT_STATUSES).default("planned"),
  ownerId: optionalUuid,
  departmentId: optionalUuid,
  clientId: optionalUuid,
  dealId: optionalUuid,
  startDate: optionalDate,
  dueDate: optionalDate,
});

export const projectUpdateSchema = projectCreateSchema.partial();
export const projectTransitionSchema = z.object({ status: z.enum(PROJECT_STATUSES) });
export const projectMemberSchema = z.object({ userId: z.string().uuid() });

export type ProjectListInput = z.infer<typeof projectListSchema>;
export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;
