import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Minimal fake of the two Drizzle query shapes used by the readiness check:
//   connections: select().from().where().orderBy().limit()
//   mappings:    select().from().where()   (awaited directly)
const state: { connection: Record<string, unknown> | null; mapping: Record<string, unknown> | null; mappingError: unknown } = { connection: null, mapping: null, mappingError: null };
vi.mock("@/db", async () => {
  const { googleDriveConnections } = await import("@/db/schema");
  return {
    db: {
      select: () => ({
        from: (table: unknown) => ({
          where: () => {
            if (table === googleDriveConnections) return { orderBy: () => ({ limit: async () => (state.connection ? [state.connection] : []) }) };
            return state.mappingError ? Promise.reject(state.mappingError) : Promise.resolve(state.mapping ? [state.mapping] : []);
          },
        }),
      }),
    },
  };
});

process.env.AUTH_GOOGLE_ID = "client-id.apps.googleusercontent.com";
process.env.AUTH_GOOGLE_SECRET = "test-secret";
process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");

const { getDriveReadiness } = await import("@/features/integrations/google-drive/connection");

const connection = { id: "conn-1", status: "active", googleAccountEmail: "owner@example.com", folderId: "parent-folder", folderName: "Nexyrium OS Receipts", folderVerifiedAt: new Date(), encryptedRefreshToken: "v1.x.y.z" };
const pgError = (code: string, message: string) => Object.assign(new Error("Failed query"), { cause: Object.assign(new Error(message), { code }) });

describe("Google Drive readiness check", () => {
  beforeEach(() => {
    state.connection = connection;
    state.mapping = null;
    state.mappingError = null;
  });

  it("is ready for a category once its folder is mapped", async () => {
    state.mapping = { connectionId: "conn-1", category: "expense", folderId: "expense-folder", folderName: "Expenses" };
    await expect(getDriveReadiness("expense")).resolves.toEqual({ ready: true, folderName: "Expenses", accountEmail: "owner@example.com" });
  });

  it("asks for the category folder (not a migration) when no mapping exists", async () => {
    await expect(getDriveReadiness("invoice")).resolves.toMatchObject({ ready: false, reason: "folder_not_authorized", message: "Choose the Invoice folder in Google Drive settings." });
  });

  it("reports migration 0011 only when the mappings table is genuinely missing (42P01)", async () => {
    state.mappingError = pgError("42P01", 'relation "google_drive_folder_mappings" does not exist');
    await expect(getDriveReadiness("expense")).resolves.toMatchObject({ ready: false, reason: "migration_pending", message: "Drive folder mappings require database migration 0011." });
  });

  it("does not blame the migration for other database errors such as a missing column (42703)", async () => {
    state.mappingError = pgError("42703", 'column "connectionId" does not exist');
    const result = await getDriveReadiness("expense");
    expect(result).toMatchObject({ ready: false, reason: "error" });
    expect(result.ready ? "" : result.message).not.toContain("migration");
  });

  it("checks connection and parent folder before category folders", async () => {
    state.connection = null;
    await expect(getDriveReadiness("expense")).resolves.toMatchObject({ reason: "not_connected" });
    state.connection = { ...connection, folderVerifiedAt: null };
    await expect(getDriveReadiness("expense")).resolves.toMatchObject({ reason: "folder_not_authorized" });
  });
});
