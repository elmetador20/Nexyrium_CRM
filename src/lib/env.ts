import "server-only";

import { z } from "zod";

const allowedPostgresProtocols = new Set(["postgres:", "postgresql:"]);
const allowedSslModes = new Set(["require", "verify-ca", "verify-full"]);

const databaseUrlSchema = z.string().trim().min(1, "DATABASE_URL is required").superRefine((value, context) => {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(value);
  } catch {
    context.addIssue({
      code: "custom",
      message: "DATABASE_URL must be a valid PostgreSQL connection URL",
    });
    return;
  }

  if (!allowedPostgresProtocols.has(parsedUrl.protocol)) {
    context.addIssue({
      code: "custom",
      message: "DATABASE_URL must use the postgres:// or postgresql:// protocol",
    });
  }

  if (!parsedUrl.hostname) {
    context.addIssue({
      code: "custom",
      message: "DATABASE_URL must include a database host",
    });
  }

  const sslMode = parsedUrl.searchParams.get("sslmode");
  if (!sslMode || !allowedSslModes.has(sslMode)) {
    context.addIssue({
      code: "custom",
      message: "DATABASE_URL must require PostgreSQL TLS with sslmode=require, verify-ca, or verify-full",
    });
  }
});

const serverEnvSchema = z.object({
  DATABASE_URL: databaseUrlSchema,
  DATABASE_SSL_CA_PATH: z.string().trim().min(1).default("certs/aiven-ca.pem"),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(20).default(10),
  DB_POOL_IDLE_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(300_000).default(60_000),
  DB_POOL_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(30_000).default(15_000),
  LEAD_IMPORT_MAX_FILE_BYTES: z.coerce.number().int().min(1_024).max(50_000_000).default(10_000_000),
  LEAD_IMPORT_MAX_ROWS: z.coerce.number().int().min(1).max(100_000).default(5_000),
  LEAD_IMPORT_PREVIEW_ROWS: z.coerce.number().int().min(1).max(100).default(25),
});

const authEnvSchema = z.object({
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  AUTH_GOOGLE_ID: z.string().trim().min(1, "AUTH_GOOGLE_ID is required"),
  AUTH_GOOGLE_SECRET: z.string().trim().min(1, "AUTH_GOOGLE_SECRET is required"),
  AUTH_URL: z.string().url().default("http://localhost:3000"),
  AUTH_TRUST_HOST: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

const metaEnvSchema = z.object({
  META_APP_ID: z.string().trim().min(1).optional(),
  META_APP_SECRET: z.string().trim().min(1).optional(),
  META_WEBHOOK_VERIFY_TOKEN: z.string().trim().min(1).optional(),
  META_GRAPH_API_VERSION: z.string().trim().regex(/^v\d+\.\d+$/).default("v25.0"),
  META_PAGE_ACCESS_TOKEN: z.string().trim().min(1).optional(),
  META_PAGE_ID: z.string().trim().min(1).optional(),
  META_DEFAULT_OWNER_ID: z.string().uuid().optional(),
  META_DEFAULT_DEPARTMENT_ID: z.string().uuid().optional(),
  META_WEBHOOK_MAX_BYTES: z.coerce.number().int().min(1_024).max(5_000_000).default(1_000_000),
});

// Google Drive uses the existing Auth.js Google OAuth client (AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET) with the
// drive.file scope. The refresh token is stored encrypted in the database (google_drive_connections).
const emptyAsUndefined = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);

const googleDriveEnvSchema = z.object({
  GOOGLE_TOKEN_ENCRYPTION_KEY: z.preprocess(emptyAsUndefined, z.string().trim().refine((value) => Buffer.from(value, "base64").length === 32, "GOOGLE_TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded").optional()),
  GOOGLE_PICKER_API_KEY: z.preprocess(emptyAsUndefined, z.string().trim().min(1).optional()),
  GOOGLE_CLOUD_PROJECT_NUMBER: z.preprocess(emptyAsUndefined, z.string().trim().regex(/^\d+$/,"GOOGLE_CLOUD_PROJECT_NUMBER must be the numeric project number").optional()),
  GOOGLE_DRIVE_FOLDER_ID: z.preprocess(emptyAsUndefined, z.string().trim().min(1).optional()),
  GOOGLE_DRIVE_MAX_FILE_BYTES: z.coerce.number().int().min(1_024).max(250_000_000).default(25_000_000),
  GOOGLE_DRIVE_ALLOWED_MIME_TYPES: z.string().trim().default("application/pdf,image/jpeg,image/png,image/webp,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
  GOOGLE_DRIVE_SHARED_DRIVE_ID: z.preprocess(emptyAsUndefined, z.string().trim().min(1).optional()),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type AuthEnv = z.infer<typeof authEnvSchema>;
export type MetaEnv = z.infer<typeof metaEnvSchema>;
export type GoogleDriveEnv = z.infer<typeof googleDriveEnvSchema>;

let cachedServerEnv: ServerEnv | undefined;
let cachedAuthEnv: AuthEnv | undefined;
let cachedMetaEnv: MetaEnv | undefined;
let cachedGoogleDriveEnv: GoogleDriveEnv | undefined;

/**
 * Parse server-only environment variables on first use.
 *
 * This is intentionally lazy so commands that do not use the database, such
 * as rendering the existing home page, remain runnable without credentials.
 * Validation errors contain field names and safe messages, never the URL value.
 */
export function getServerEnv(): ServerEnv {
  cachedServerEnv ??= serverEnvSchema.parse(process.env);
  return cachedServerEnv;
}

export function getAuthEnv(): AuthEnv {
  cachedAuthEnv ??= authEnvSchema.parse(process.env);
  return cachedAuthEnv;
}

export function getMetaEnv(): MetaEnv {
  cachedMetaEnv ??= metaEnvSchema.parse(process.env);
  return cachedMetaEnv;
}

export function getGoogleDriveEnv(): GoogleDriveEnv {
  cachedGoogleDriveEnv ??= googleDriveEnvSchema.parse(process.env);
  return cachedGoogleDriveEnv;
}

export function getGoogleDriveConfigurationStatus() {
  const result = googleDriveEnvSchema.safeParse(process.env);
  if (!result.success) {
    return { configured: false, missing: result.error.issues.map((issue) => issue.path.join(".")) };
  }
  const missing = [
    process.env.AUTH_GOOGLE_ID ? null : "AUTH_GOOGLE_ID",
    process.env.AUTH_GOOGLE_SECRET ? null : "AUTH_GOOGLE_SECRET",
    result.data.GOOGLE_TOKEN_ENCRYPTION_KEY ? null : "GOOGLE_TOKEN_ENCRYPTION_KEY",
  ].filter((value): value is string => value !== null);
  return { configured: missing.length === 0, missing };
}

export function getSafeEnvironmentError(error: unknown): string {
  if (error instanceof z.ZodError) {
    const fields = error.issues.map((issue) => issue.path.join(".") || "environment");
    return `Invalid server environment: ${[...new Set(fields)].join(", ")}`;
  }

  return "Invalid server environment configuration";
}
