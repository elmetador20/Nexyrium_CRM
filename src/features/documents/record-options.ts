import "server-only";

import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { clients, deals, leads } from "@/db/schema";
import { getCrmScope, type CrmScope } from "@/features/crm/shared/types";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { can, type AuthorizationActor } from "@/lib/authorization/policy";

export type RecordOption = { type: "lead" | "client" | "deal"; id: string; label: string; detail: string | null };

const LIMIT = 500;

function scoped(table: typeof leads | typeof clients | typeof deals, scope: CrmScope) {
  if (scope.kind === "global") return undefined;
  if (scope.kind === "owner") return eq(table.ownerId, scope.userId);
  return scope.departmentIds.length ? inArray(table.departmentId, scope.departmentIds) : sql`false`;
}

/**
 * Records the actor may attach documents to, using the same CRM scope rules as the CRM pages.
 * The document service re-checks the chosen record on upload; this list is only for selection.
 */
export async function getDocumentRecordOptions(actor: AuthorizationActor): Promise<RecordOption[]> {
  const scope = getCrmScope(actor);
  const [leadRows, clientRows, dealRows] = await Promise.all([
    can(actor, PERMISSIONS.CRM_LEADS_READ)
      ? db.select({ id: leads.id, name: leads.contactName, company: leads.companyName }).from(leads).where(and(isNull(leads.archivedAt), scoped(leads, scope))).orderBy(desc(leads.createdAt)).limit(LIMIT)
      : [],
    can(actor, PERMISSIONS.CRM_CLIENTS_READ)
      ? db.select({ id: clients.id, name: clients.name, company: clients.companyName }).from(clients).where(and(isNull(clients.archivedAt), scoped(clients, scope))).orderBy(desc(clients.createdAt)).limit(LIMIT)
      : [],
    can(actor, PERMISSIONS.CRM_DEALS_READ)
      ? db.select({ id: deals.id, name: deals.title, client: clients.name }).from(deals).leftJoin(clients, eq(clients.id, deals.clientId)).where(and(isNull(deals.archivedAt), scoped(deals, scope))).orderBy(desc(deals.createdAt)).limit(LIMIT)
      : [],
  ]);
  return [
    ...clientRows.map((r) => ({ type: "client" as const, id: r.id, label: r.name, detail: r.company })),
    ...dealRows.map((r) => ({ type: "deal" as const, id: r.id, label: r.name, detail: r.client })),
    ...leadRows.map((r) => ({ type: "lead" as const, id: r.id, label: r.name, detail: r.company })),
  ];
}
