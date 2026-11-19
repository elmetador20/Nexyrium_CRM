import "server-only";

import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { clients, deals, departments, leads, projects, users } from "@/db/schema";

type Ids = Array<string | null | undefined>;

export type LabelRequest = { users?: Ids; departments?: Ids; clients?: Ids; leads?: Ids; deals?: Ids; projects?: Ids };
export type Labels = Record<keyof LabelRequest, Map<string, string>>;

const unique = (ids: Ids = []) => [...new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0))];

/**
 * Resolve record ids to human-readable names in one round trip per table, so
 * pages never have to render raw UUIDs. Unknown ids simply have no label.
 */
export async function resolveLabels(request: LabelRequest): Promise<Labels> {
  const ids = {
    users: unique(request.users), departments: unique(request.departments), clients: unique(request.clients),
    leads: unique(request.leads), deals: unique(request.deals), projects: unique(request.projects),
  };
  const [userRows, departmentRows, clientRows, leadRows, dealRows, projectRows] = await Promise.all([
    ids.users.length ? db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, ids.users)) : [],
    ids.departments.length ? db.select({ id: departments.id, name: departments.name }).from(departments).where(inArray(departments.id, ids.departments)) : [],
    ids.clients.length ? db.select({ id: clients.id, name: clients.name }).from(clients).where(inArray(clients.id, ids.clients)) : [],
    ids.leads.length ? db.select({ id: leads.id, name: leads.contactName }).from(leads).where(inArray(leads.id, ids.leads)) : [],
    ids.deals.length ? db.select({ id: deals.id, name: deals.title }).from(deals).where(inArray(deals.id, ids.deals)) : [],
    ids.projects.length ? db.select({ id: projects.id, name: projects.name }).from(projects).where(inArray(projects.id, ids.projects)) : [],
  ]);
  return {
    users: new Map(userRows.map((row) => [row.id, row.name || row.email])),
    departments: new Map(departmentRows.map((row) => [row.id, row.name])),
    clients: new Map(clientRows.map((row) => [row.id, row.name])),
    leads: new Map(leadRows.map((row) => [row.id, row.name])),
    deals: new Map(dealRows.map((row) => [row.id, row.name])),
    projects: new Map(projectRows.map((row) => [row.id, row.name])),
  };
}

/** Look up a label, falling back to a neutral word instead of the raw id. */
export function label(map: Map<string, string>, id: string | null | undefined, fallback = "Unassigned") {
  if (!id) return fallback;
  return map.get(id) ?? "Unavailable";
}
