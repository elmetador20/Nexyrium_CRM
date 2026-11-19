import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs, clientLeads, clients, deals, leads } from "@/db/schema";
import { CrmError } from "@/features/crm/shared/errors";
import { getCrmScope } from "@/features/crm/shared/types";

export type ConversionUnitOfWork = {
  leads: {
    findById(id: string, scope: ReturnType<typeof getCrmScope>): Promise<typeof leads.$inferSelect | null>;
    markConverted(id: string): Promise<typeof leads.$inferSelect>;
  };
  clients: {
    create(input: typeof clients.$inferInsert): Promise<typeof clients.$inferSelect>;
    linkLead(clientId: string, leadId: string): Promise<void>;
  };
  deals: {
    create(input: typeof deals.$inferInsert): Promise<typeof deals.$inferSelect>;
  };
  audit: (event: {
    actorUserId: string;
    action: string;
    resourceType: string;
    resourceId?: string | null;
    outcome: "success" | "failure";
    metadata?: Record<string, unknown>;
  }) => Promise<void>;
};

export type ConversionTransaction = <T>(work: (uow: ConversionUnitOfWork) => Promise<T>) => Promise<T>;

function scopeCondition(scope: ReturnType<typeof getCrmScope>) {
  if (scope.kind === "global") return undefined;
  if (scope.kind === "owner") return eq(leads.ownerId, scope.userId);
  return scope.departmentIds.length ? inArray(leads.departmentId, scope.departmentIds) : sql`false`;
}

export const runCrmTransaction: ConversionTransaction = async (work) =>
  db.transaction(async (tx) =>
    work({
      leads: {
        async findById(id, scope) {
          const [lead] = await tx
            .select()
            .from(leads)
            .where(and(eq(leads.id, id), isNull(leads.archivedAt), scopeCondition(scope)))
            .limit(1);
          return lead ?? null;
        },
        async markConverted(id) {
          const [lead] = await tx
            .update(leads)
            .set({ status: "won", convertedAt: new Date(), updatedAt: new Date() })
            .where(eq(leads.id, id))
            .returning();
          if (!lead) throw new CrmError("NOT_FOUND", "Lead could not be converted.");
          return lead;
        },
      },
      clients: {
        async create(input) {
          const [client] = await tx.insert(clients).values(input).returning();
          if (!client) throw new Error("Client conversion insert did not return a record");
          return client;
        },
        async linkLead(clientId, leadId) {
          await tx.insert(clientLeads).values({ clientId, leadId });
        },
      },
      deals: {
        async create(input) {
          const [deal] = await tx.insert(deals).values(input).returning();
          if (!deal) throw new Error("Deal conversion insert did not return a record");
          return deal;
        },
      },
      async audit(event) {
        await tx.insert(auditLogs).values(event);
      },
      }),
  );
