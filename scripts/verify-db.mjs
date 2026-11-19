import { config } from "dotenv";
import { Pool } from "pg";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

config({ path: ".env.local" });
config({ path: ".env" });

const databaseUrl = process.env.DATABASE_URL;

let parsedUrl;

try {
  parsedUrl = databaseUrl ? new URL(databaseUrl) : undefined;
} catch {
  parsedUrl = undefined;
}

const sslMode = parsedUrl?.searchParams.get("sslmode");

if (
  !parsedUrl ||
  !["postgres:", "postgresql:"].includes(parsedUrl.protocol) ||
  !["require", "verify-ca", "verify-full"].includes(sslMode)
) {
  console.error(
    "Database verification failed: DATABASE_URL is missing or invalid."
  );
  process.exit(1);
}

const caPath = resolve(process.env.DATABASE_SSL_CA_PATH ?? "certs/aiven-ca.pem");
const ca = existsSync(caPath) ? readFileSync(caPath, "utf8") : undefined;

if (ca) {
  parsedUrl.searchParams.delete("sslmode");
}

const pool = new Pool({
  connectionString: parsedUrl.toString(),
  ...(ca ? { ssl: { ca, rejectUnauthorized: true } } : {}),
  max: 1,
  idleTimeoutMillis: 5000,
  connectionTimeoutMillis: 5000,
  keepAlive: true,
});

try {
  await pool.query("select 1");
  console.log("Database connection verified.");
} catch (error) {
  const code =
    error && typeof error === "object" && "code" in error
      ? error.code
      : undefined;

  const suffix = typeof code === "string" ? ` (${code})` : "";
  console.error(`Database verification failed${suffix}. Check DATABASE_URL and Aiven network access.`);

  process.exitCode = 1;
} finally {
  await pool.end();
}
