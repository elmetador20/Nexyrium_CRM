"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { departments } from "@/db/schema";
import { recordAuditEvent } from "@/lib/audit/service";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { requirePermission } from "@/lib/authorization/server";

const departmentSchema = z.object({ name: z.string().trim().min(2, "Enter a department name.").max(150) });

export type DepartmentFormState = { error?: string; created?: string };

function slugify(name: string) {
  return name.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 150);
}

/** Add a department (additive only; existing departments are never renamed or removed here). */
export async function createDepartment(_state: DepartmentFormState, form: FormData): Promise<DepartmentFormState> {
  const actor = await requirePermission(PERMISSIONS.SETTINGS_MANAGE);
  const parsed = departmentSchema.safeParse({ name: form.get("name") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid department." };
  const slug = slugify(parsed.data.name);
  if (!slug) return { error: "Use letters or numbers in the department name." };
  const [row] = await db.insert(departments).values({ name: parsed.data.name, slug }).onConflictDoNothing({ target: departments.slug }).returning();
  if (!row) return { error: "A department with this name already exists." };
  await recordAuditEvent({ actorUserId: actor.userId, action: "settings.department.create", resourceType: "department", resourceId: row.id, outcome: "success" });
  revalidatePath("/settings");
  return { created: row.name };
}
