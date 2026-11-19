import type { AuditEventInput } from "@/lib/audit/service";
import type { AuthorizationActor } from "@/lib/authorization/policy";
import { can } from "@/lib/authorization/policy";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import type { NotificationPublisher } from "@/lib/notifications";
import { ROLE_SLUGS } from "@/lib/authorization/roles";
import { getCrmScope } from "@/features/crm/shared/types";
import { canAccessCrmRecord, canManageMembers, canManageProject, canReadProject, projectAccess } from "../scope";
import { ProjectError } from "../errors";
import { projectCreateSchema, projectListSchema, projectMemberSchema, projectTransitionSchema, projectUpdateSchema } from "../schemas";
import { PROJECT_TRANSITIONS } from "@/types/projects";
import type { ProjectRepository } from "../queries";

type ProjectServiceDependencies = {
  repository: ProjectRepository;
  countOpenTasks: (projectId: string) => Promise<number>;
  countOpenAssignedTasks: (projectId: string, userId: string) => Promise<number>;
  audit?: (input: AuditEventInput) => Promise<void>;
  notifications?: NotificationPublisher;
};

function dateValue(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function validateDates(startDate: string | null, dueDate: string | null) {
  if (startDate && dueDate && dueDate < startDate) throw new ProjectError("INVALID", "The due date cannot be before the start date.");
}

function isPrivileged(actor: AuthorizationActor) {
  return actor.roles.some((role) => [ROLE_SLUGS.OWNER_ADMIN, ROLE_SLUGS.FOUNDER].includes(role as never));
}

async function resolveAssignment(repository: ProjectRepository, actor: AuthorizationActor, ownerId: string | null | undefined, departmentId: string | null | undefined) {
  const owner = ownerId ?? actor.userId;
  const department = departmentId ?? actor.departmentIds[0] ?? null;
  const target = await repository.findActiveUser(owner);
  if (!target?.isActive) throw new ProjectError("INVALID", "The project owner must be an active user.");
  if (!isPrivileged(actor) && owner !== actor.userId && !actor.roles.includes(ROLE_SLUGS.DEPARTMENT_LEAD)) throw new ProjectError("FORBIDDEN", "You cannot assign project ownership to another user.");
  if (!isPrivileged(actor) && department && !actor.departmentIds.includes(department)) throw new ProjectError("FORBIDDEN", "You cannot assign a project to another department.");
  if (department && !(await repository.isUserInDepartment(owner, department))) throw new ProjectError("INVALID", "The project owner must belong to the selected department.");
  return { ownerId: owner, departmentId: department };
}

async function validateCrmLinks(repository: ProjectRepository, actor: AuthorizationActor, input: { clientId?: string | null; dealId?: string | null }) {
  const scope = getCrmScope(actor);
  const client = input.clientId ? await repository.findClient(input.clientId, scope) : null;
  if (input.clientId && !client) throw new ProjectError("NOT_FOUND", "The selected client was not found.");
  const deal = input.dealId ? await repository.findDeal(input.dealId, scope) : null;
  if (input.dealId && !deal) throw new ProjectError("NOT_FOUND", "The selected deal was not found.");
  if (client && !canAccessCrmRecord(actor, PERMISSIONS.CRM_CLIENTS_READ, { ownerUserId: client.ownerId, departmentId: client.departmentId })) throw new ProjectError("FORBIDDEN", "You cannot link this client.");
  if (deal && !canAccessCrmRecord(actor, PERMISSIONS.CRM_DEALS_READ, { ownerUserId: deal.ownerId, departmentId: deal.departmentId })) throw new ProjectError("FORBIDDEN", "You cannot link this deal.");
  if (client && deal?.clientId && deal.clientId !== client.id) throw new ProjectError("CONFLICT", "The selected deal belongs to a different client.");
  return { client, deal };
}

function projectResponse(project: typeof import("@/db/schema").projects.$inferSelect) {
  return { ...project };
}

export function createProjectService({ repository, countOpenTasks, countOpenAssignedTasks, audit = async () => undefined, notifications }: ProjectServiceDependencies) {
  async function writeAudit(input: AuditEventInput) { await audit(input); }
  async function notify(input: Parameters<NotificationPublisher["publish"]>[0]) { if (notifications) await notifications.publish(input); }

  async function authorized(actor: AuthorizationActor, projectId: string) {
    const project = await repository.findById(projectId, projectAccess(actor));
    if (!project) throw new ProjectError("NOT_FOUND", "Project not found.");
    const member = await repository.isMember(projectId, actor.userId);
    if (!canReadProject(actor, project, member)) throw new ProjectError("NOT_FOUND", "Project not found.");
    return project;
  }

  return {
    async list(actor: AuthorizationActor, rawInput: unknown) {
      if (!can(actor, PERMISSIONS.PROJECTS_READ)) throw new ProjectError("FORBIDDEN", "You do not have permission to read projects.");
      const input = projectListSchema.parse(rawInput);
      return repository.list(input, projectAccess(actor));
    },

    async get(actor: AuthorizationActor, projectId: string) {
      const project = await authorized(actor, projectId);
      const [members, activities] = await Promise.all([repository.listMembers(projectId), repository.listActivities(projectId)]);
      return { project: projectResponse(project), members, activities };
    },

    async create(actor: AuthorizationActor, rawInput: unknown, correlationId?: string) {
      if (!can(actor, PERMISSIONS.PROJECTS_CREATE)) throw new ProjectError("FORBIDDEN", "You do not have permission to create projects.");
      const input = projectCreateSchema.parse(rawInput);
      const assignment = await resolveAssignment(repository, actor, input.ownerId, input.departmentId);
      const startDate = dateValue(input.startDate);
      const dueDate = dateValue(input.dueDate);
      validateDates(startDate, dueDate);
      await validateCrmLinks(repository, actor, input);
      const project = await repository.create({
        name: input.name,
        description: input.description || null,
        status: input.status,
        ownerId: assignment.ownerId,
        departmentId: assignment.departmentId,
        clientId: input.clientId || null,
        dealId: input.dealId || null,
        startDate,
        dueDate,
      });
      await repository.addMember({ projectId: project.id, userId: project.ownerId!, addedByUserId: actor.userId });
      await repository.addActivity({ projectId: project.id, actorUserId: actor.userId, type: "project.created", content: `Project created: ${project.name}`, metadata: {} });
      await writeAudit({ actorUserId: actor.userId, action: "project.create", resourceType: "project", resourceId: project.id, outcome: "success", correlationId, metadata: { name: project.name, ownerId: project.ownerId, departmentId: project.departmentId } });
      return projectResponse(project);
    },

    async update(actor: AuthorizationActor, projectId: string, rawInput: unknown, correlationId?: string) {
      const current = await repository.findByIdForMutation(projectId);
      if (!current || !canManageProject(actor, current)) throw new ProjectError("NOT_FOUND", "Project not found.");
      const input = projectUpdateSchema.parse(rawInput);
      const nextOwnerId = input.ownerId === undefined ? current.ownerId : input.ownerId;
      const nextDepartmentId = input.departmentId === undefined ? current.departmentId : input.departmentId;
      const assignment = await resolveAssignment(repository, actor, nextOwnerId, nextDepartmentId);
      const startDate = input.startDate === undefined ? current.startDate : dateValue(input.startDate);
      const dueDate = input.dueDate === undefined ? current.dueDate : dateValue(input.dueDate);
      validateDates(startDate, dueDate);
      const clientId = input.clientId === undefined ? current.clientId : input.clientId;
      const dealId = input.dealId === undefined ? current.dealId : input.dealId;
      await validateCrmLinks(repository, actor, { clientId, dealId });
      const updated = await repository.update(projectId, {
        ...input,
        description: input.description === undefined ? current.description : input.description || null,
        ownerId: assignment.ownerId,
        departmentId: assignment.departmentId,
        clientId: clientId || null,
        dealId: dealId || null,
        startDate,
        dueDate,
      });
      await repository.addActivity({ projectId, actorUserId: actor.userId, type: "project.updated", content: `Project updated: ${updated.name}`, metadata: { previous: { name: current.name, ownerId: current.ownerId, departmentId: current.departmentId, dueDate: current.dueDate }, next: { name: updated.name, ownerId: updated.ownerId, departmentId: updated.departmentId, dueDate: updated.dueDate } } });
      await writeAudit({ actorUserId: actor.userId, action: "project.update", resourceType: "project", resourceId: projectId, outcome: "success", correlationId, metadata: { previous: { ownerId: current.ownerId, departmentId: current.departmentId, dueDate: current.dueDate }, next: { ownerId: updated.ownerId, departmentId: updated.departmentId, dueDate: updated.dueDate }, changedFields: Object.keys(input) } });
      return projectResponse(updated);
    },

    async archive(actor: AuthorizationActor, projectId: string, correlationId?: string) {
      const current = await repository.findByIdForMutation(projectId);
      if (!current || !canManageProject(actor, current)) throw new ProjectError("NOT_FOUND", "Project not found.");
      const archived = await repository.archive(projectId);
      if (!archived) throw new ProjectError("NOT_FOUND", "Project not found.");
      await writeAudit({ actorUserId: actor.userId, action: "project.archive", resourceType: "project", resourceId: projectId, outcome: "success", correlationId });
      return projectResponse(archived);
    },

    async transition(actor: AuthorizationActor, projectId: string, rawInput: unknown, correlationId?: string) {
      const current = await repository.findByIdForMutation(projectId);
      if (!current || !canManageProject(actor, current)) throw new ProjectError("NOT_FOUND", "Project not found.");
      const { status } = projectTransitionSchema.parse(rawInput);
      if (!PROJECT_TRANSITIONS[current.status].includes(status)) throw new ProjectError("CONFLICT", `Project cannot move from ${current.status} to ${status}.`);
      if (status === "completed" && (await countOpenTasks(projectId)) > 0) throw new ProjectError("CONFLICT", "A project cannot be completed while it has open tasks.");
      const updated = await repository.update(projectId, { status });
      await repository.addActivity({ projectId, actorUserId: actor.userId, type: "project.status_changed", content: `Project status changed from ${current.status} to ${status}.`, metadata: { fromStatus: current.status, toStatus: status } });
      await writeAudit({ actorUserId: actor.userId, action: "project.transition", resourceType: "project", resourceId: projectId, outcome: "success", correlationId, metadata: { fromStatus: current.status, toStatus: status } });
      const members = await repository.listMembers(projectId);
      await notify({ recipientUserIds: members.map((member) => member.userId).filter((id) => id !== actor.userId), type: "project.status_changed", title: "Project status changed", body: `${updated.name} is now ${status.replace("_", " ")}.`, resourceType: "project", resourceId: projectId, dedupeKey: `project-status:${projectId}:${updated.updatedAt.toISOString()}`, correlationId });
      return projectResponse(updated);
    },

    async listMembers(actor: AuthorizationActor, projectId: string) {
      await authorized(actor, projectId);
      return repository.listMembers(projectId);
    },

    async addMember(actor: AuthorizationActor, projectId: string, rawInput: unknown, correlationId?: string) {
      const project = await repository.findByIdForMutation(projectId);
      if (!project || !canManageMembers(actor, project)) throw new ProjectError("NOT_FOUND", "Project not found.");
      const { userId } = projectMemberSchema.parse(rawInput);
      const user = await repository.findActiveUser(userId);
      if (!user?.isActive) throw new ProjectError("INVALID", "Only active users can join a project.");
      if (!isPrivileged(actor) && project.departmentId && !(await repository.isUserInDepartment(userId, project.departmentId))) throw new ProjectError("FORBIDDEN", "The selected user is outside the project department.");
      await repository.addMember({ projectId, userId, addedByUserId: actor.userId });
      await repository.addActivity({ projectId, actorUserId: actor.userId, type: "project.member_added", content: `${user.name ?? user.email} was added to the project.`, metadata: { userId } });
      await writeAudit({ actorUserId: actor.userId, action: "project.member.add", resourceType: "project", resourceId: projectId, outcome: "success", correlationId, metadata: { userId } });
      await notify({ recipientUserIds: [userId], type: "project.member.added", title: "You were added to a project", body: `You are now a member of ${project.name}.`, resourceType: "project", resourceId: projectId, dedupeKey: `project-member-added:${projectId}:${userId}`, correlationId });
      return repository.listMembers(projectId);
    },

    async removeMember(actor: AuthorizationActor, projectId: string, userId: string, correlationId?: string) {
      const project = await repository.findByIdForMutation(projectId);
      if (!project || !canManageMembers(actor, project)) throw new ProjectError("NOT_FOUND", "Project not found.");
      if (project.ownerId === userId) throw new ProjectError("CONFLICT", "The project owner cannot be removed from the team.");
      if ((await countOpenAssignedTasks(projectId, userId)) > 0) throw new ProjectError("CONFLICT", "Reassign open tasks before removing this member.");
      const user = await repository.findActiveUser(userId);
      await repository.removeMember(projectId, userId);
      await repository.addActivity({ projectId, actorUserId: actor.userId, type: "project.member_removed", content: `${user?.name ?? user?.email ?? "A user"} was removed from the project.`, metadata: { userId } });
      await writeAudit({ actorUserId: actor.userId, action: "project.member.remove", resourceType: "project", resourceId: projectId, outcome: "success", correlationId, metadata: { userId } });
      await notify({ recipientUserIds: [userId], type: "project.member.removed", title: "You were removed from a project", body: `You are no longer a member of ${project.name}.`, resourceType: "project", resourceId: projectId, dedupeKey: `project-member-removed:${projectId}:${userId}`, correlationId });
      return repository.listMembers(projectId);
    },
  };
}
