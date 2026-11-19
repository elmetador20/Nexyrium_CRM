import Link from "next/link";

import { ProjectForm } from "@/features/projects/components/ProjectForm";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { requirePagePermission } from "@/lib/authorization/server";

export const instant = false;

export default async function NewProjectPage() { await requirePagePermission(PERMISSIONS.PROJECTS_CREATE); return <section className="mx-auto max-w-4xl"><Link href="/projects" className="text-sm text-text-muted hover:underline">← Back to projects</Link><div className="mt-5 rounded-xl border border-border bg-surface p-6"><h2 className="text-2xl font-semibold">New project</h2><p className="mt-2 text-sm text-text-muted">Create a scoped project and optionally link it to a client and deal.</p><div className="mt-8"><ProjectForm endpoint="/api/v1/projects" method="POST" /></div></div></section>; }
