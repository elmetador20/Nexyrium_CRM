import Link from "next/link";
import { notFound } from "next/navigation";

import { ProjectForm } from "@/features/projects/components/ProjectForm";
import { getProjectService } from "@/features/projects/server";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { requirePagePermission } from "@/lib/authorization/server";

export const instant = false;

export default async function EditProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const actor = await requirePagePermission(PERMISSIONS.PROJECTS_UPDATE);
  const { projectId } = await params;
  const detail = await getProjectService().get(actor, projectId).catch(() => null);
  if (!detail) notFound();
  const project = detail.project;
  return <section className="mx-auto max-w-4xl"><Link href={`/projects/${projectId}`} className="text-sm text-text-muted hover:underline">← Back to project</Link><div className="mt-5 rounded-xl border border-border bg-surface p-6"><h2 className="text-2xl font-semibold">Edit project</h2><div className="mt-8"><ProjectForm endpoint={`/api/v1/projects/${projectId}`} method="PATCH" initial={project} /></div></div></section>;
}
