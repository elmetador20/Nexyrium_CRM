import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Match the Next.js local-development convention without printing values.
config({ path: ".env.local" });
config({ path: ".env" });

// Drizzle Kit requires a URL even for offline schema generation/checking. The
// placeholder is never a real credential and db:migrate validates that an
// actual DATABASE_URL is present before invoking Drizzle Kit.
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://migration-placeholder:migration-placeholder@localhost:5432/migration-placeholder?sslmode=verify-full";

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  casing: "snake_case",
  dbCredentials: {
    url: databaseUrl,
  },
  migrations: {
    table: "__drizzle_migrations",
    schema: "drizzle",
  },
});
