
import "dotenv/config";

import { config } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "../src/db/schema";
import {
  auditLogs,
  roles,
  userRoles,
  users,
} from "../src/db/schema/foundation";

config({ path: resolve(process.cwd(), ".env.local") });

async function main() {
  const email = process.env.FIRST_USER_EMAIL?.trim().toLowerCase();
  const name = process.env.FIRST_USER_NAME?.trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(
      "Set FIRST_USER_EMAIL to the intended Google account email."
    );
  }

  if (!name) {
    throw new Error("Set FIRST_USER_NAME to the founder's name.");
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is missing from .env.local.");
  }

  const caPath = process.env.DATABASE_SSL_CA_PATH;
  const ca = caPath
    ? existsSync(resolve(caPath))
      ? readFileSync(resolve(caPath), "utf8")
      : undefined
    : undefined;

  if (!ca) {
    throw new Error(
      "Aiven CA certificate was not found. Check DATABASE_SSL_CA_PATH; TLS verification will not be disabled."
    );
  }

  const url = new URL(databaseUrl);
  url.searchParams.delete("sslmode");

  const pool = new Pool({
    connectionString: url.toString(),
    ssl: { ca, rejectUnauthorized: true },
    max: 1,
  });

  const db = drizzle(pool, { schema });

  try {
    const result = await db.transaction(async (tx) => {
      // Serialize bootstrap attempts so two runs cannot both pass the empty-table check.
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(873421098)`
      );

      const existingUsers = await tx
        .select({ id: users.id })
        .from(users)
        .limit(1);

      if (existingUsers.length > 0) {
        throw new Error(
          "Bootstrap stopped: the users table is not empty. No user was created."
        );
      }

      const [founderRole] = await tx
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.slug, "founder"))
        .limit(1);

      if (!founderRole) {
        throw new Error(
          'The "founder" role was not found. Run npm run db:seed first.'
        );
      }

      const [user] = await tx
        .insert(users)
        .values({
          email,
          name,
          isActive: true,
        })
        .returning({
          id: users.id,
          email: users.email,
        });

      await tx.insert(userRoles).values({
        userId: user.id,
        roleId: founderRole.id,
      });

      await tx.insert(auditLogs).values({
        actorUserId: null,
        action: "auth.bootstrap.first_user",
        resourceType: "user",
        resourceId: user.id,
        outcome: "success",
        metadata: {
          roleSlug: "founder",
          bootstrapMethod: "one-time-script",
        },
      });

      return user;
    });

    console.log("First user created successfully.");
    console.log(`Email: ${result.email}`);
    console.log("Role: founder");
    console.log("Next step: sign in using Google OAuth.");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(
    "Bootstrap failed:",
    error instanceof Error ? error.message : "Unknown error"
  );
  process.exitCode = 1;
});
