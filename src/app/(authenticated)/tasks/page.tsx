import Link from "next/link";
import { PageHeader } from "@/components/nx";
import { getTaskService } from "@/features/tasks/server";
import { TaskTable } from "@/features/tasks/components/TaskTable";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { requirePagePermission } from "@/lib/authorization/server";

export const instant = false;

export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePagePermission(PERMISSIONS.TASKS_READ);
  const params = await searchParams;
  const result = await getTaskService().list(actor, { projectId: typeof params.projectId === "string" ? params.projectId : undefined, status: typeof params.status === "string" ? params.status : undefined, priority: typeof params.priority === "string" ? params.priority : undefined, assigneeId: typeof params.assigneeId === "string" ? params.assigneeId : undefined, search: typeof params.search === "string" ? params.search : undefined, sort: typeof params.sort === "string" ? params.sort : "created", direction: typeof params.direction === "string" ? params.direction : "desc", page: typeof params.page === "string" ? params.page : "1", pageSize: 20 });
  return <section><PageHeader eyebrow="Work" title="Tasks" description={`${result.total} accessible task${result.total === 1 ? "" : "s"} · tasks belong to projects`} actions={<Link href="/projects" className="button-secondary px-3 py-2 text-sm">Projects</Link>} /><form className="mb-5 grid gap-3 rounded-[14px] border border-border bg-surface p-3 md:grid-cols-4"><input className="input mt-0" name="search" defaultValue={typeof params.search === "string" ? params.search : ""} placeholder="Search tasks" /><select className="input mt-0" name="status" defaultValue={typeof params.status === "string" ? params.status : ""}><option value="">All statuses</option><option value="todo">To do</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="done">Done</option><option value="canceled">Canceled</option></select><select className="input mt-0" name="priority" defaultValue={typeof params.priority === "string" ? params.priority : ""}><option value="">All priorities</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select><select className="input mt-0" name="sort" defaultValue={typeof params.sort === "string" ? params.sort : "created"}><option value="created">Newest</option><option value="due">Due date</option><option value="priority">Priority</option><option value="status">Status</option></select><button className="button-secondary md:col-span-4" type="submit">Apply filters</button></form><TaskTable tasks={result.items} /></section>;
}
