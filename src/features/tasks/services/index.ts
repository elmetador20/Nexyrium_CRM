import type { AuditEventInput } from "@/lib/audit/service";
import type { AuthorizationActor } from "@/lib/authorization/policy";
import { can } from "@/lib/authorization/policy";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import type { NotificationPublisher } from "@/lib/notifications";
import { canManageProject, canReadProject, projectAccess } from "@/features/projects/scope";
import { TASK_TRANSITIONS, isTaskOverdue } from "@/types/tasks";
import { TaskError } from "../errors";
import { taskCreateSchema, taskListSchema, taskTransitionSchema, taskUpdateSchema } from "../schemas";
import type { TaskRepository } from "../queries";

type TaskServiceDependencies = {
  repository: TaskRepository;
  addProjectActivity: (input: { projectId: string; actorUserId: string; type: string; content: string; metadata: Record<string, unknown> }) => Promise<unknown>;
  audit?: (input: AuditEventInput) => Promise<void>;
  notifications?: NotificationPublisher;
};

function dateValue(value: Date | null | undefined) { return value ? value.toISOString().slice(0, 10) : null; }

function taskResponse(task: typeof import("@/db/schema").tasks.$inferSelect) {
  return { ...task, overdue: isTaskOverdue(task) };
}

function canUpdateTask(actor: AuthorizationActor, project: typeof import("@/db/schema").projects.$inferSelect, task: typeof import("@/db/schema").tasks.$inferSelect, isMember: boolean) {
  if (!can(actor, PERMISSIONS.TASKS_UPDATE)) return false;
  if (canManageProject(actor, project)) return true;
  return isMember && (task.assigneeId === actor.userId || project.ownerId === actor.userId);
}

export function createTaskService({ repository, addProjectActivity, audit = async () => undefined, notifications }: TaskServiceDependencies) {
  async function notify(input: Parameters<NotificationPublisher["publish"]>[0]) { if (notifications) await notifications.publish(input); }
  async function writeAudit(input: AuditEventInput) { await audit(input); }

  return {
    async list(actor: AuthorizationActor, rawInput: unknown) {
      if (!can(actor, PERMISSIONS.TASKS_READ)) throw new TaskError("FORBIDDEN", "You do not have permission to read tasks.");
      const input = taskListSchema.parse(rawInput);
      const result = await repository.list(input, projectAccess(actor));
      return { items: result.items.map(taskResponse), total: result.total };
    },

    async get(actor: AuthorizationActor, taskId: string) {
      if (!can(actor, PERMISSIONS.TASKS_READ)) throw new TaskError("FORBIDDEN", "You do not have permission to read tasks.");
      const task = await repository.findById(taskId, projectAccess(actor));
      if (!task) throw new TaskError("NOT_FOUND", "Task not found.");
      return taskResponse(task);
    },

    async create(actor: AuthorizationActor, projectId: string, rawInput: unknown, correlationId?: string) {
      if (!can(actor, PERMISSIONS.TASKS_CREATE)) throw new TaskError("FORBIDDEN", "You do not have permission to create tasks.");
      const input = taskCreateSchema.parse(rawInput);
      const access = projectAccess(actor);
      const project = await repository.findProject(projectId, access);
      if (!project || !canReadProject(actor, project, await repository.isProjectMember(projectId, actor.userId))) throw new TaskError("NOT_FOUND", "Project not found.");
      const isMember = await repository.isProjectMember(projectId, actor.userId);
      if (!isMember && !canManageProject(actor, project)) throw new TaskError("FORBIDDEN", "Only project members can create tasks.");
      if (input.assigneeId) await ensureAssignee(repository, projectId, input.assigneeId);
      if (input.status === "done") throw new TaskError("INVALID", "Create the task before completing it.");
      const task = await repository.create({ projectId, title: input.title, description: input.description || null, status: input.status, priority: input.priority, assigneeId: input.assigneeId || null, createdByUserId: actor.userId, dueDate: dateValue(input.dueDate), completedAt: null });
      await addProjectActivity({ projectId, actorUserId: actor.userId, type: "task.created", content: `Task created: ${task.title}`, metadata: { taskId: task.id } });
      await writeAudit({ actorUserId: actor.userId, action: "task.create", resourceType: "task", resourceId: task.id, outcome: "success", correlationId, metadata: { projectId, assigneeId: task.assigneeId } });
      if (task.assigneeId) await notify({ recipientUserIds: [task.assigneeId], type: "task.assigned", title: "You were assigned a task", body: task.title, resourceType: "task", resourceId: task.id, dedupeKey: `task-assigned:${task.id}:${task.assigneeId}`, correlationId });
      return taskResponse(task);
    },

    async update(actor: AuthorizationActor, taskId: string, rawInput: unknown, correlationId?: string) {
      const current = await repository.findByIdForMutation(taskId);
      if (!current) throw new TaskError("NOT_FOUND", "Task not found.");
      const project = await repository.findProject(current.projectId, projectAccess(actor));
      if (!project) throw new TaskError("NOT_FOUND", "Task not found.");
      const isMember = await repository.isProjectMember(current.projectId, actor.userId);
      if (!canUpdateTask(actor, project, current, isMember)) throw new TaskError("FORBIDDEN", "You cannot update this task.");
      const input = taskUpdateSchema.parse(rawInput);
      if (input.assigneeId) await ensureAssignee(repository, current.projectId, input.assigneeId);
      const updated = await repository.update(taskId, { ...input, description: input.description === undefined ? current.description : input.description || null, assigneeId: input.assigneeId === undefined ? current.assigneeId : input.assigneeId || null, dueDate: input.dueDate === undefined ? current.dueDate : dateValue(input.dueDate) });
      await addProjectActivity({ projectId: current.projectId, actorUserId: actor.userId, type: "task.updated", content: `Task updated: ${updated.title}`, metadata: { taskId, previous: { assigneeId: current.assigneeId, dueDate: current.dueDate, priority: current.priority }, next: { assigneeId: updated.assigneeId, dueDate: updated.dueDate, priority: updated.priority } } });
      await writeAudit({ actorUserId: actor.userId, action: "task.update", resourceType: "task", resourceId: taskId, outcome: "success", correlationId, metadata: { projectId: current.projectId, previous: { assigneeId: current.assigneeId, dueDate: current.dueDate }, next: { assigneeId: updated.assigneeId, dueDate: updated.dueDate } } });
      if (updated.assigneeId && updated.assigneeId !== current.assigneeId) await notify({ recipientUserIds: [updated.assigneeId], type: "task.assigned", title: "You were assigned a task", body: updated.title, resourceType: "task", resourceId: taskId, dedupeKey: `task-assigned:${taskId}:${updated.assigneeId}`, correlationId });
      return taskResponse(updated);
    },

    async archive(actor: AuthorizationActor, taskId: string, correlationId?: string) {
      const current = await repository.findByIdForMutation(taskId);
      if (!current) throw new TaskError("NOT_FOUND", "Task not found.");
      const project = await repository.findProject(current.projectId, projectAccess(actor));
      if (!project || !canManageProject(actor, project)) throw new TaskError("NOT_FOUND", "Task not found.");
      const archived = await repository.archive(taskId);
      if (!archived) throw new TaskError("NOT_FOUND", "Task not found.");
      await addProjectActivity({ projectId: current.projectId, actorUserId: actor.userId, type: "task.archived", content: `Task archived: ${current.title}`, metadata: { taskId } });
      await writeAudit({ actorUserId: actor.userId, action: "task.archive", resourceType: "task", resourceId: taskId, outcome: "success", correlationId, metadata: { projectId: current.projectId } });
      return taskResponse(archived);
    },

    async transition(actor: AuthorizationActor, taskId: string, rawInput: unknown, correlationId?: string) {
      const current = await repository.findByIdForMutation(taskId);
      if (!current) throw new TaskError("NOT_FOUND", "Task not found.");
      const project = await repository.findProject(current.projectId, projectAccess(actor));
      if (!project) throw new TaskError("NOT_FOUND", "Task not found.");
      const isMember = await repository.isProjectMember(current.projectId, actor.userId);
      if (!canUpdateTask(actor, project, current, isMember)) throw new TaskError("FORBIDDEN", "You cannot transition this task.");
      const { status } = taskTransitionSchema.parse(rawInput);
      if (!TASK_TRANSITIONS[current.status].includes(status)) throw new TaskError("CONFLICT", `Task cannot move from ${current.status} to ${status}.`);
      const completedAt = status === "done" ? new Date() : null;
      const updated = await repository.update(taskId, { status, completedAt });
      await addProjectActivity({ projectId: current.projectId, actorUserId: actor.userId, type: "task.status_changed", content: `Task status changed from ${current.status} to ${status}.`, metadata: { taskId, fromStatus: current.status, toStatus: status } });
      await writeAudit({ actorUserId: actor.userId, action: "task.transition", resourceType: "task", resourceId: taskId, outcome: "success", correlationId, metadata: { projectId: current.projectId, fromStatus: current.status, toStatus: status, completedAt } });
      if (updated.assigneeId) await notify({ recipientUserIds: [updated.assigneeId], type: "task.status_changed", title: "Task status changed", body: `${updated.title} is now ${status.replace("_", " ")}.`, resourceType: "task", resourceId: taskId, dedupeKey: `task-status:${taskId}:${updated.updatedAt.toISOString()}`, correlationId });
      return taskResponse(updated);
    },
  };
}

async function ensureAssignee(repository: TaskRepository, projectId: string, assigneeId: string) {
  const user = await repository.findActiveUser(assigneeId);
  if (!user?.isActive) throw new TaskError("INVALID", "Tasks can only be assigned to active users.");
  if (!(await repository.isProjectMember(projectId, assigneeId))) throw new TaskError("CONFLICT", "The assignee must be a project member.");
}
