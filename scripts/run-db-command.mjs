import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, resolve } from "node:path";
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

const command = process.argv[2];

if (command !== "migrate") {
  console.error("Unsupported database command.");
  process.exit(1);
}

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
  console.error("Database migration requires a valid DATABASE_URL in .env.local or the process environment.");
  process.exit(1);
}

const caPath = resolve(process.env.DATABASE_SSL_CA_PATH ?? "certs/aiven-ca.pem");
const childEnvironment = { ...process.env };

if (existsSync(caPath)) {
  childEnvironment.NODE_EXTRA_CA_CERTS = childEnvironment.NODE_EXTRA_CA_CERTS
    ? `${childEnvironment.NODE_EXTRA_CA_CERTS}${delimiter}${caPath}`
    : caPath;
}

const drizzleKitCommand =
  process.platform === "win32" ? "npx.cmd" : "npx";

const drizzleKitArgs =
  process.platform === "win32"
    ? ["drizzle-kit", ...process.argv.slice(2)]
    : ["drizzle-kit", ...process.argv.slice(2)];

const result = spawnSync(drizzleKitCommand, drizzleKitArgs, {
  env: childEnvironment,
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.error) {
  console.error("Unable to start Drizzle Kit:", result.error.message);
  process.exit(1);
}

if (result.signal) {
  console.error(`Drizzle Kit terminated by signal: ${result.signal}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
