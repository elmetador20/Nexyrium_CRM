import { pgEnum, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import { users } from "./foundation";

export const employmentStatusEnum = pgEnum("employment_status", ["active", "on_leave", "terminated", "contractor"]);

export const peopleProfiles = pgTable("people_profiles", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  jobTitle: varchar("job_title", { length: 160 }),
  employmentStatus: employmentStatusEnum("employment_status").default("active").notNull(),
  managerUserId: uuid("manager_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type PeopleProfile = typeof peopleProfiles.$inferSelect;
