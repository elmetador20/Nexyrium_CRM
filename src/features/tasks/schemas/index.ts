import { z } from "zod";

import { TASK_PRIORITIES, TASK_STATUSES } from "@/types/tasks";

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();

export const taskListSchema = z.object({
  projectId: z.string().uuid().optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  assigneeId: z.string().uuid().optional(),
  dueBefore: z.coerce.date().optional(),
  dueAfter: z.coerce.date().optional(),
  search: z.string().trim().max(100).optional(),
  sort: z.enum(["created", "due", "priority", "status"]).default("created"),
  direction: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const taskCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: optionalText(10_000),
  status: z.enum(TASK_STATUSES).default("todo"),
  priority: z.enum(TASK_PRIORITIES).default("medium"),
  assigneeId: z.string().uuid().optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
});

export const taskUpdateSchema = taskCreateSchema.partial().omit({ status: true });
export const taskTransitionSchema = z.object({ status: z.enum(TASK_STATUSES) });

export type TaskListInput = z.infer<typeof taskListSchema>;
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;
