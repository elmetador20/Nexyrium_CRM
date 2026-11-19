import { check, date, index, integer, numeric, pgEnum, pgTable, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { departments, users } from "./foundation";

export const targetUnitEnum = pgEnum("target_unit", ["count", "minor_amount"]);

export const departmentTargets = pgTable(
  "department_targets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    departmentId: uuid("department_id").notNull().references(() => departments.id, { onDelete: "restrict" }),
    metricKey: varchar("metric_key", { length: 80 }).notNull(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    unit: targetUnitEnum("unit").notNull(),
    targetCount: integer("target_count"),
    targetMinor: numeric("target_minor", { precision: 20, scale: 0 }),
    currencyCode: varchar("currency_code", { length: 3 }),
    createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    updatedByUserId: uuid("updated_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("department_targets_period_valid", sql`${table.periodEnd} >= ${table.periodStart}`),
    check("department_targets_value_valid", sql`(${table.unit} = 'count' AND ${table.targetCount} IS NOT NULL AND ${table.targetCount} >= 0 AND ${table.targetMinor} IS NULL AND ${table.currencyCode} IS NULL) OR (${table.unit} = 'minor_amount' AND ${table.targetCount} IS NULL AND ${table.targetMinor} IS NOT NULL AND ${table.targetMinor} >= 0 AND ${table.currencyCode} IS NOT NULL)`),
    uniqueIndex("department_targets_period_metric_unique").on(table.departmentId, table.metricKey, table.periodStart, table.periodEnd),
    index("department_targets_department_period_idx").on(table.departmentId, table.periodStart, table.periodEnd),
  ],
);

export type DepartmentTarget = typeof departmentTargets.$inferSelect;
