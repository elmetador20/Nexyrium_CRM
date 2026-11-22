"use client";
import "@/features/reports/components/workspace.css";


import { useRouter } from "next/navigation";

type Task = { id: string; title: string; status: string; priority: string; assigneeId: string | null; dueDate: string | null; overdue: boolean };

export function TaskTable({ tasks, assignees = {} }: { tasks: Task[]; assignees?: Record<string, string> }) {
  const router = useRouter();
  async function transition(taskId: string, status: string) {
    const response = await fetch(`/api/v1/tasks/${taskId}/transition`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
    if (response.ok) router.refresh();
  }
  if (!tasks.length) return <p className="rounded-xl border border-dashed border-border-strong p-8 text-center text-sm text-text-muted">No tasks found.</p>;
  return <div className="table-container bg-surface"><table className="data-table"><thead><tr><th>Task</th><th>Status</th><th>Priority</th><th>Assignee</th><th>Due</th></tr></thead><tbody>{tasks.map((task) => <tr key={task.id}><td className="font-medium">{task.title}</td><td><select aria-label={`Status for ${task.title}`} className="input mt-0 min-w-32" value={task.status} onChange={(event) => transition(task.id, event.target.value)}><option value="todo">To do</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="done">Done</option><option value="canceled">Canceled</option></select></td><td className="capitalize">{task.priority}</td><td className="text-text-secondary">{task.assigneeId ? assignees[task.assigneeId] ?? "Assigned" : "Unassigned"}</td><td className={task.overdue ? "font-semibold text-danger" : "text-text-secondary"}>{task.dueDate ?? "—"}{task.overdue ? " · overdue" : ""}</td></tr>)}</tbody></table></div>;
}
