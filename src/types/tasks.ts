export const TASK_STATUSES = ["todo", "in_progress", "blocked", "done", "canceled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  todo: ["in_progress", "canceled"],
  in_progress: ["blocked", "done", "canceled"],
  blocked: ["in_progress", "canceled"],
  done: ["in_progress"],
  canceled: ["todo"],
};

export function isTaskOverdue(input: { dueDate: string | null; status: TaskStatus }, now = new Date()): boolean {
  if (!input.dueDate || input.status === "done" || input.status === "canceled") return false;
  return input.dueDate < now.toISOString().slice(0, 10);
}
