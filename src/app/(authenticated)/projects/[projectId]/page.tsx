import Link from "next/link";
import { notFound } from "next/navigation";

import { ProjectDetailWorkspace } from "@/features/projects/components/ProjectDetailWorkspace";
import { getProjectService } from "@/features/projects/server";
import { getTaskService } from "@/features/tasks/server";
import { canManageMembers } from "@/features/projects/scope";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { requirePagePermission } from "@/lib/authorization/server";
import type { AuthorizationActor } from "@/lib/authorization/policy";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { label, resolveLabels } from "@/lib/labels";

export const instant = false;

export default async function ProjectDetailPage({ params }: { params: Promise<{ projectId: string }> }) {
  const actor = await requirePagePermission(PERMISSIONS.PROJECTS_READ);
  const { projectId } = await params;
  const data = await loadProjectDetail(actor, projectId);
  if (!data) notFound();
  const { detail, tasks } = data;
  const p = detail.project;
  const [labels, people] = await Promise.all([
    resolveLabels({ users: [p.ownerId, ...tasks.items.map((t) => t.assigneeId)], departments: [p.departmentId], clients: [p.clientId], deals: [p.dealId] }),
    canManageMembers(actor, p) ? db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.isActive, true)).orderBy(asc(users.name), asc(users.email)) : Promise.resolve([]),
  ]);
  const names = { owner: label(labels.users, p.ownerId), department: label(labels.departments, p.departmentId), client: p.clientId ? label(labels.clients, p.clientId) : "—", deal: p.dealId ? label(labels.deals, p.dealId) : "—" };
  return <section><Link href="/projects" className="text-sm text-text-muted hover:underline">← Back to projects</Link><div className="mt-5"><ProjectDetailWorkspace project={{ ...detail.project, startDate: detail.project.startDate, dueDate: detail.project.dueDate }} members={detail.members.map((member) => ({ ...member, createdAt: member.createdAt.toISOString() }))} activities={detail.activities.map((activity) => ({ ...activity, createdAt: activity.createdAt.toISOString() }))} tasks={tasks.items.map((task) => ({ ...task, dueDate: task.dueDate, overdue: task.overdue }))} canManageMembers={canManageMembers(actor, detail.project)} names={names} people={people.map((u) => ({ id: u.id, name: u.name || u.email }))} assignees={Object.fromEntries(labels.users)} /></div></section>;
}

async function loadProjectDetail(actor: AuthorizationActor, projectId: string) {
  try {
    const [detail, tasks] = await Promise.all([
      getProjectService().get(actor, projectId),
      getTaskService().list(actor, { projectId, page: 1, pageSize: 100, sort: "created", direction: "desc" }),
    ]);
    return { detail, tasks };
  } catch {
    return null;
  }
}
