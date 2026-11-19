import { describe, expect, it } from "vitest";

import type { Project, ProjectActivity, ProjectMember, Task } from "@/db/schema";
import type { ProjectRepository } from "@/features/projects/queries";
import { createProjectService } from "@/features/projects/services";
import type { TaskRepository } from "@/features/tasks/queries";
import { createTaskService } from "@/features/tasks/services";
import type { AuthorizationActor } from "@/lib/authorization/policy";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { ROLE_SLUGS } from "@/lib/authorization/roles";
import { isTaskOverdue } from "@/types/tasks";

const ownerId = "owner-user";
const departmentId = "department-1";
const assigneeId = "22222222-2222-4222-8222-222222222222";
const projectId = "33333333-3333-4333-8333-333333333333";

const actor: AuthorizationActor = {
  userId: ownerId,
  email: "owner@example.com",
  name: "Owner",
  isActive: true,
  roles: [ROLE_SLUGS.SALES],
  permissions: [
    PERMISSIONS.PROJECTS_READ,
    PERMISSIONS.PROJECTS_CREATE,
    PERMISSIONS.PROJECTS_UPDATE,
    PERMISSIONS.PROJECTS_DELETE,
    PERMISSIONS.TASKS_READ,
    PERMISSIONS.TASKS_CREATE,
    PERMISSIONS.TASKS_UPDATE,
    PERMISSIONS.TASKS_DELETE,
    PERMISSIONS.CRM_CLIENTS_READ,
    PERMISSIONS.CRM_DEALS_READ,
  ],
  departmentIds: [departmentId],
};

function projectFixture(overrides: Partial<Project> = {}): Project {
  return {
    id: projectId,
    name: "Website rollout",
    description: "Delivery project",
    status: "active",
    ownerId,
    departmentId,
    clientId: null,
    dealId: null,
    startDate: "2026-01-01",
    dueDate: "2026-02-01",
    archivedAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function taskFixture(overrides: Partial<Task> = {}): Task {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    projectId,
    title: "Prepare launch",
    description: null,
    status: "in_progress",
    priority: "high",
    assigneeId: assigneeId,
    createdByUserId: ownerId,
    dueDate: "2026-01-15",
    completedAt: null,
    archivedAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function projectRepo(overrides: Partial<ProjectRepository> = {}) {
  let project = projectFixture();
  const activities: ProjectActivity[] = [];
  const members: ProjectMember[] = [{ projectId, userId: ownerId, addedByUserId: ownerId, createdAt: new Date() }];
  return {
    repository: {
      async list() { return { items: [project], total: 1 }; },
      async findById() { return project; },
      async findByIdForMutation() { return project; },
      async findClient() { return null; },
      async findDeal() { return null; },
      async findActiveUser(id: string) { return { id, name: id, email: `${id}@example.com`, isActive: true }; },
      async isUserInDepartment() { return true; },
      async create(input) { project = projectFixture(input as Partial<Project>); return project; },
      async update(_id, input) { project = projectFixture({ ...project, ...input, updatedAt: new Date() }); return project; },
      async archive() { return project; },
      async listMembers() { return members.map((member) => ({ userId: member.userId, name: member.userId, email: `${member.userId}@example.com`, createdAt: member.createdAt })); },
      async isMember(_id, userId) { return members.some((member) => member.userId === userId); },
      async addMember(input) { members.push({ ...input, addedByUserId: input.addedByUserId ?? null, createdAt: new Date() }); },
      async removeMember(_id, userId) { const index = members.findIndex((member) => member.userId === userId); if (index >= 0) members.splice(index, 1); },
      async addActivity(input) { const activity = { id: `activity-${activities.length + 1}`, createdAt: new Date(), ...input } as ProjectActivity; activities.push(activity); return activity; },
      async listActivities() { return activities; },
      ...overrides,
    } as ProjectRepository,
    members,
    activities,
    getProject: () => project,
  };
}

describe("projects and tasks", () => {
  it("blocks project completion while open tasks remain and audits valid transitions", async () => {
    const audits: string[] = [];
    const fake = projectRepo();
    let openTasks = 1;
    const service = createProjectService({ repository: fake.repository, countOpenTasks: async () => openTasks, countOpenAssignedTasks: async () => 0, audit: async (event) => { audits.push(event.action); } });

    await expect(service.transition(actor, projectId, { status: "completed" })).rejects.toMatchObject({ code: "CONFLICT" });
    openTasks = 0;
    const updated = await service.transition(actor, projectId, { status: "completed" });

    expect(updated.status).toBe("completed");
    expect(audits).toEqual(["project.transition"]);
    expect(fake.activities.at(-1)?.metadata).toMatchObject({ fromStatus: "active", toStatus: "completed" });
  });

  it("rejects project member changes without project update permission", async () => {
    const fake = projectRepo();
    const service = createProjectService({ repository: fake.repository, countOpenTasks: async () => 0, countOpenAssignedTasks: async () => 0 });
    await expect(service.addMember({ ...actor, permissions: [PERMISSIONS.PROJECTS_READ] }, projectId, { userId: assigneeId })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("requires task assignees to be project members", async () => {
    const fake = projectRepo();
    const taskRepository = {
      async list() { return { items: [], total: 0 }; },
      async findById() { return null; },
      async findByIdForMutation() { return null; },
      async findProject() { return fake.getProject(); },
      async isProjectMember() { return false; },
      async findActiveUser(id: string) { return { id, name: "Assignee", email: "assignee@example.com", isActive: true }; },
      async create() { return taskFixture(); },
      async update() { return taskFixture(); },
      async archive() { return null; },
      async countOpen() { return 0; },
      async countOpenAssigned() { return 0; },
    } as unknown as TaskRepository;
    const service = createTaskService({ repository: taskRepository, addProjectActivity: async () => undefined });

    await expect(service.create(actor, projectId, { title: "Assign me", assigneeId })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("updates task status, completion timestamp, and rejects unauthorized task mutations", async () => {
    let task = taskFixture();
    const fake = projectRepo();
    const taskRepository = {
      async list() { return { items: [task], total: 1 }; },
      async findById() { return task; },
      async findByIdForMutation() { return task; },
      async findProject() { return fake.getProject(); },
      async isProjectMember() { return true; },
      async findActiveUser(id: string) { return { id, name: "Assignee", email: "assignee@example.com", isActive: true }; },
      async create() { return task; },
      async update(_id: string, input: Partial<Task>) { task = taskFixture({ ...task, ...input, updatedAt: new Date() }); return task; },
      async archive() { return task; },
      async countOpen() { return 0; },
      async countOpenAssigned() { return 0; },
    } as unknown as TaskRepository;
    const audits: string[] = [];
    const service = createTaskService({ repository: taskRepository, addProjectActivity: async () => undefined, audit: async (event) => { audits.push(event.action); } });

    const done = await service.transition(actor, task.id, { status: "done" });
    expect(done.status).toBe("done");
    expect(done.completedAt).toBeInstanceOf(Date);
    expect(audits).toEqual(["task.transition"]);
    await expect(service.update({ ...actor, permissions: [PERMISSIONS.TASKS_READ] }, task.id, { title: "Nope" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("handles overdue boundaries without marking terminal tasks overdue", () => {
    const now = new Date("2026-02-10T12:00:00Z");
    expect(isTaskOverdue({ dueDate: "2026-02-09", status: "in_progress" }, now)).toBe(true);
    expect(isTaskOverdue({ dueDate: "2026-02-10", status: "in_progress" }, now)).toBe(false);
    expect(isTaskOverdue({ dueDate: "2026-02-11", status: "in_progress" }, now)).toBe(false);
    expect(isTaskOverdue({ dueDate: null, status: "in_progress" }, now)).toBe(false);
    expect(isTaskOverdue({ dueDate: "2026-02-09", status: "done" }, now)).toBe(false);
    expect(isTaskOverdue({ dueDate: "2026-02-09", status: "canceled" }, now)).toBe(false);
  });
});
