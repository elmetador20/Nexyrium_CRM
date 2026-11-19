import "server-only";

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { getServerEnv } from "@/lib/env";

import * as schema from "./schema";

const globalForDatabase = globalThis as typeof globalThis & {
  nexyriumDatabasePool?: Pool;
};

function createPool(): Pool {
  const env = getServerEnv();
  const caPath = resolve(env.DATABASE_SSL_CA_PATH);
  const ca = existsSync(caPath) ? readFileSync(caPath, "utf8") : undefined;
  const databaseUrl = new URL(env.DATABASE_URL);

  // pg's connection-string parser can override an explicit SSL object when
  // sslmode remains in the URL. Remove it only when the Aiven CA is available;
  // otherwise retain the URL's own TLS behavior and let connection failure be
  // reported without exposing credentials.
  if (ca) {
    databaseUrl.searchParams.delete("sslmode");
  }

  return new Pool({
    connectionString: databaseUrl.toString(),
    ...(ca ? { ssl: { ca, rejectUnauthorized: true } } : {}),
    max: env.DB_POOL_MAX,
    idleTimeoutMillis: env.DB_POOL_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: env.DB_POOL_CONNECTION_TIMEOUT_MS,
    keepAlive: true,
  });
}

export const pool = globalForDatabase.nexyriumDatabasePool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  globalForDatabase.nexyriumDatabasePool = pool;
}

export const db = drizzle(pool, { schema });

export type Database = typeof db;
