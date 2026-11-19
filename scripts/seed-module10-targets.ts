import { config } from "dotenv";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";

import { departmentTargets, departments, users } from "../src/db/schema";

config({ path: ".env.local" });
config({ path: ".env" });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");
const parsedUrl = new URL(databaseUrl);
const caPath = resolve(process.env.DATABASE_SSL_CA_PATH ?? "certs/aiven-ca.pem");
const ca = existsSync(caPath) ? readFileSync(caPath, "utf8") : undefined;
if (ca) parsedUrl.searchParams.delete("sslmode");
const pool = new Pool({ connectionString: parsedUrl.toString(), ...(ca ? { ssl: { ca, rejectUnauthorized: true } } : {}), max: 1 });
const db = drizzle(pool);

function period(value: string | undefined) {
  const current = new Date();
  const key = value ?? `${current.getUTCFullYear()}-${String(current.getUTCMonth() + 1).padStart(2, "0")}`;
  if (!/^\d{4}-\d{2}$/.test(key)) throw new Error("TARGET_SEED_PERIOD must use YYYY-MM.");
  const start = `${key}-01`;
  const end = new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0)).toISOString().slice(0, 10);
  return { start, end };
}

async function main() {
  const { start, end } = period(process.env.TARGET_SEED_PERIOD);
  await db.transaction(async (tx) => {
    const [actor] = await tx.select({ id: users.id }).from(users).where(eq(users.isActive, true)).orderBy(users.createdAt).limit(1);
    if (!actor) throw new Error("At least one active user is required before seeding targets.");
    for (const example of [{ name: "Technology", slug: "technology", targetMinor: "50000000" }, { name: "Design", slug: "design", targetMinor: "20000000" }]) {
      await tx.insert(departments).values({ name: example.name, slug: example.slug }).onConflictDoNothing({ target: departments.slug });
      const [department] = await tx.select({ id: departments.id }).from(departments).where(eq(departments.slug, example.slug)).limit(1);
      if (!department) throw new Error(`Department ${example.slug} could not be created.`);
      const [existing] = await tx.select({ id: departmentTargets.id }).from(departmentTargets).where(and(eq(departmentTargets.departmentId, department.id), eq(departmentTargets.metricKey, "payments_received_minor"), eq(departmentTargets.periodStart, start), eq(departmentTargets.periodEnd, end))).limit(1);
      if (existing) continue;
      await tx.insert(departmentTargets).values({ departmentId: department.id, metricKey: "payments_received_minor", periodStart: start, periodEnd: end, unit: "minor_amount", targetMinor: example.targetMinor, currencyCode: "INR", createdByUserId: actor.id, updatedByUserId: actor.id });
    }
  });
  console.log(`Seeded Module 10 target examples for ${period(process.env.TARGET_SEED_PERIOD).start.slice(0, 7)}.`);
}

main().then(async () => { await pool.end(); process.exit(0); }).catch(async (error) => { console.error(error instanceof Error ? error.message : "Target seed failed."); await pool.end(); process.exit(1); });
