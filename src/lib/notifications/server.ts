import "server-only";

import { notifications } from "@/db/schema";
import { db } from "@/db";

import type { NotificationPublisher } from "./adapter";

export const inAppNotificationPublisher: NotificationPublisher = {
  async publish(input) {
    if (!input.recipientUserIds.length) return;
    await db
      .insert(notifications)
      .values(
        input.recipientUserIds.map((recipientUserId) => ({
          recipientUserId,
          type: input.type,
          title: input.title,
          body: input.body,
          resourceType: input.resourceType ?? null,
          resourceId: input.resourceId ?? null,
          dedupeKey: input.dedupeKey ? `${input.dedupeKey}:${recipientUserId}` : null,
          metadata: { ...(input.metadata ?? {}), correlationId: input.correlationId ?? null },
        })),
      )
      .onConflictDoNothing({ target: notifications.dedupeKey });
  },
};
