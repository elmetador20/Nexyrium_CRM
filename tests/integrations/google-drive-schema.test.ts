import { readFileSync } from "node:fs";
import path from "node:path";

import { getTableConfig, PgTable, QueryBuilder } from "drizzle-orm/pg-core";
import { and, eq, is } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import { driveFolderMappings, driveUploads } from "@/db/schema";

// Regression: migration 0011 was generated with drizzle-kit `casing: "snake_case"`, but the runtime client has no
// casing option. Unnamed columns were therefore queried as "connectionId" and failed with 42703 at runtime, which the
// Google Drive settings page reported as "Category configuration requires migration 0011 and database access."

function migrationColumns(table: string): string[] {
  const sql = readFileSync(path.resolve(__dirname, "../../src/db/migrations/0011_google-drive-category-folders.sql"), "utf8");
  const body = sql.match(new RegExp(`CREATE TABLE "${table}" \\(([\\s\\S]*?)\\n\\);`))?.[1];
  if (!body) throw new Error(`Table ${table} not found in migration 0011`);
  return [...body.matchAll(/^\s*"([a-z_]+)"\s/gm)].map((match) => match[1]);
}

describe("Google Drive category tables match migration 0011", () => {
  it.each([
    ["google_drive_folder_mappings", driveFolderMappings],
    ["google_drive_upload_operations", driveUploads],
  ] as const)("%s uses exactly the migrated column names", (name, table) => {
    const config = getTableConfig(table);
    expect(config.name).toBe(name);
    expect(config.columns.map((column) => column.name).sort()).toEqual(migrationColumns(name).sort());
  });

  it("the category-mapping lookup used by the readiness check queries snake_case columns", () => {
    const query = new QueryBuilder().select().from(driveFolderMappings)
      .where(and(eq(driveFolderMappings.connectionId, "00000000-0000-4000-8000-000000000000"), eq(driveFolderMappings.category, "expense")))
      .toSQL();
    expect(query.sql).toContain('"google_drive_folder_mappings"."connection_id" = $1');
    expect(query.sql).toContain('"folder_name"');
    expect(query.sql).not.toMatch(/"connectionId"|"folderName"|"verifiedAt"|"configuredBy"/);
  });

  it("no table in the schema relies on implicit (camelCase) column names", () => {
    const offenders: string[] = [];
    for (const value of Object.values(schema)) {
      if (!is(value, PgTable)) continue;
      const config = getTableConfig(value);
      for (const column of config.columns) if (/[A-Z]/.test(column.name)) offenders.push(`${config.name}.${column.name}`);
    }
    expect(offenders).toEqual([]);
  });
});
