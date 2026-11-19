import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { Pool } from "pg";

import { permissions, rolePermissions, roles } from "../src/db/schema/index";
import { ALL_PERMISSIONS } from "../src/lib/authorization/permissions";
import { ROLE_PERMISSIONS, ROLE_SLUGS } from "../src/lib/authorization/roles";

config({ path: ".env.local" });
config({ path: ".env" });

const roleNames: Record<string, string> = {
  [ROLE_SLUGS.OWNER_ADMIN]: "Owner/Admin",
  [ROLE_SLUGS.FOUNDER]: "Founder",
  [ROLE_SLUGS.DEPARTMENT_LEAD]: "Department Lead",
  [ROLE_SLUGS.SALES]: "Sales",
  [ROLE_SLUGS.DELIVERY_CONTRIBUTOR]: "Delivery Contributor",
  [ROLE_SLUGS.REVIEWER]: "Reviewer",
  [ROLE_SLUGS.FINANCE]: "Finance",
  [ROLE_SLUGS.PEOPLE_HR]: "People/HR",
  [ROLE_SLUGS.READ_ONLY_AUDITOR]: "Read-only Auditor",
};

const databaseUrl = process.env.DATABASE_URL;
let parsedUrl: URL | undefined;

try {
  parsedUrl = databaseUrl ? new URL(databaseUrl) : undefined;
} catch {
  parsedUrl = undefined;
}

const sslMode = parsedUrl?.searchParams.get("sslmode");
if (
  !parsedUrl ||
  !["postgres:", "postgresql:"].includes(parsedUrl.protocol) ||
  !["require", "verify-ca", "verify-full"].includes(sslMode ?? "")
) {
  console.error("Authorization seed failed: DATABASE_URL is missing or invalid.");
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
  idleTimeoutMillis: 5_000,
  connectionTimeoutMillis: 5_000,
  keepAlive: true,
});
const db = drizzle(pool);

async function main() {
  await db.transaction(async (tx) => {
    const permissionIds = new Map<string, string>();
    for (const slug of ALL_PERMISSIONS) {
      const [permission] = await tx
        .insert(permissions)
        .values({ name: slug, slug })
        .onConflictDoNothing({ target: permissions.slug })
        .returning({ id: permissions.id, slug: permissions.slug });

      if (permission) {
        permissionIds.set(permission.slug, permission.id);
      } else {
        const [existing] = await tx
          .select({ id: permissions.id, slug: permissions.slug })
          .from(permissions)
          .where(eq(permissions.slug, slug));
        if (existing) permissionIds.set(existing.slug, existing.id);
      }
    }

    for (const [slug, name] of Object.entries(roleNames)) {
      const [role] = await tx
        .insert(roles)
        .values({ name, slug })
        .onConflictDoNothing({ target: roles.slug })
        .returning({ id: roles.id, slug: roles.slug });
      const [existingRole] = role
        ? [role]
        : await tx.select({ id: roles.id, slug: roles.slug }).from(roles).where(eq(roles.slug, slug));
      const roleId = existingRole?.id;
      if (!roleId) continue;

      const configuredPermissions = ROLE_PERMISSIONS[slug as keyof typeof ROLE_PERMISSIONS];
      const permissionSlugs = configuredPermissions[0] === "*" ? ALL_PERMISSIONS : configuredPermissions;
      await tx
        .insert(rolePermissions)
        .values(permissionSlugs.map((permission) => ({ roleId, permissionId: permissionIds.get(permission)! })))
        .onConflictDoNothing();
    }
  });

  console.log("Authorization roles and permissions seeded.");
}

main()
  .then(() => pool.end())
  .catch(async () => {
    console.error("Authorization seed failed. Check DATABASE_URL and that migrations are applied.");
    await pool.end();
    process.exitCode = 1;
  });
