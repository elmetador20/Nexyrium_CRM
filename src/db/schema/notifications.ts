import { integer, primaryKey, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

import { users } from "./foundation";

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    recipientUserId: uuid("recipient_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 100 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    body: text("body").notNull(),
    resourceType: varchar("resource_type", { length: 100 }),
    resourceId: uuid("resource_id"),
    dedupeKey: varchar("dedupe_key", { length: 255 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("notifications_dedupe_key_unique").on(table.dedupeKey),
    index("notifications_recipient_created_idx").on(table.recipientUserId, table.createdAt),
    index("notifications_unread_idx").on(table.recipientUserId, table.readAt),
  ],
);

export type Notification = typeof notifications.$inferSelect;

export const pushDevices = pgTable("notification_push_devices",{
  id:uuid("id").defaultRandom().primaryKey(),
  userId:uuid("user_id").notNull().references(()=>users.id,{onDelete:"cascade"}),
  endpoint:text("endpoint").notNull(),
  p256dh:text("p256dh"),
  auth:text("auth"),
},t=>[uniqueIndex("push_devices_endpoint_unique").on(t.endpoint),index("push_devices_user_idx").on(t.userId)]);

export const pushDeliveries = pgTable("notification_push_deliveries",{
  notificationId:uuid("notification_id").notNull().references(()=>notifications.id,{onDelete:"cascade"}),
  deviceId:uuid("device_id").notNull().references(()=>pushDevices.id,{onDelete:"cascade"}),
  attempts:integer("attempts").default(0).notNull(),
  nextAttemptAt:timestamp("next_attempt_at",{withTimezone:true}).defaultNow().notNull(),
},t=>[primaryKey({columns:[t.notificationId,t.deviceId]}),index("push_deliveries_due_idx").on(t.nextAttemptAt)]);
