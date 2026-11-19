import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { metaIntegrationEvents } from "@/db/schema";

export type MetaEventInput = typeof metaIntegrationEvents.$inferInsert;
export type MetaEvent = typeof metaIntegrationEvents.$inferSelect;

export type MetaEventRepository = {
  claim(input: MetaEventInput, retryFailed?: boolean): Promise<{ event: MetaEvent; created: boolean; retryable: boolean }>;
  update(id: string, input: Partial<MetaEventInput>): Promise<MetaEvent>;
  findById(id: string): Promise<MetaEvent | null>;
  list(input: { page: number; pageSize: number; status?: string }): Promise<{ items: MetaEvent[]; total: number }>;
};

export const metaEventRepository: MetaEventRepository = {
  async claim(input, retryFailed = true) {
    const [created] = await db.insert(metaIntegrationEvents).values(input).onConflictDoNothing({ target: [metaIntegrationEvents.provider, metaIntegrationEvents.integrationKey, metaIntegrationEvents.externalEventId] }).returning();
    if (created) return { event: created, created: true, retryable: true };
    const [existing] = await db.select().from(metaIntegrationEvents).where(and(eq(metaIntegrationEvents.provider, input.provider ?? "meta"), eq(metaIntegrationEvents.integrationKey, input.integrationKey), eq(metaIntegrationEvents.externalEventId, input.externalEventId))).limit(1);
    if (!existing) throw new Error("Meta integration event could not be claimed.");
    if (existing.payloadHash !== input.payloadHash) {
      throw new Error("Meta external event was received with a different payload.");
    }
    if (retryFailed && existing.status === "failed") {
      const retried = await this.update(existing.id, { status: "received", attemptCount: existing.attemptCount + 1, errorCode: null, errorMessage: null });
      return { event: retried, created: false, retryable: true };
    }
    return { event: existing, created: false, retryable: existing.status === "failed" };
  },
  async update(id, input) {
    const [event] = await db.update(metaIntegrationEvents).set({ ...input, updatedAt: new Date() }).where(eq(metaIntegrationEvents.id, id)).returning();
    if (!event) throw new Error("Meta integration event could not be updated.");
    return event;
  },
  async findById(id) {
    const [event] = await db.select().from(metaIntegrationEvents).where(eq(metaIntegrationEvents.id, id)).limit(1);
    return event ?? null;
  },
  async list({ page, pageSize, status }) {
    const where = status ? eq(metaIntegrationEvents.status, status as typeof metaIntegrationEvents.$inferSelect.status) : undefined;
    const offset = (page - 1) * pageSize;
    const [items, [{ total }]] = await Promise.all([
      db.select().from(metaIntegrationEvents).where(where).orderBy(desc(metaIntegrationEvents.receivedAt)).limit(pageSize).offset(offset),
      db.select({ total: sql<number>`count(*)` }).from(metaIntegrationEvents).where(where),
    ]);
    return { items, total: Number(total) };
  },
};
