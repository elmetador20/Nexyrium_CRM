# SaaS readiness review

Status: **review and plan only. No schema change has been applied to any database.**
Date: 2026-11-19

## Where the system is today

| Concern | Current state |
| --- | --- |
| Tenancy | Single tenant. One PostgreSQL database (Neon) holds every record. There is no `organization_id` / `workspace_id` column on business tables. |
| Users | `users` table, Google sign-in (Auth.js), invitation flow. A user belongs to the one workspace implicitly. |
| Roles & permissions | `roles`, `permissions`, `role_permissions`, `user_roles` with a fixed permission catalogue (`src/lib/authorization/permissions.ts`). Checked on every page (`requirePagePermission`) and API route (`requirePermission`). |
| Data scope | `getCrmScope` / `financeScope` / `expenseScope` resolve an actor to **global**, **department** (via `user_departments`) or **owner** scope. Every list and report query applies it. |
| Departments | `departments` table (Design, Technology today). Optional `department_id` on leads, clients, deals, expenses, invoices, payments, projects, documents. New departments can be added from **Settings → Departments** (additive only). |
| Branding | Hard-coded NEXYRIUM palette in `globals.css`; logo at `/public/Logo.png`; workspace name from `WORKSPACE_DISPLAY_NAME`. |
| Isolation | Logical only (scope conditions in queries). No row-level security. |

## Options for multiple organizations / workspaces

### A. Database-per-workspace with a control plane (Astra's draft)
`src/features/crm/workspaces/001_control_plane.sql` creates a separate `nexyrium_control` schema with
`organizations` (slug, display name, logo, primary colour), `workspaces` (hostname, secret reference to a
per-workspace database URL) and `workspace_memberships` (Google subject → workspace user).

* Strongest isolation: a query bug cannot leak another tenant's rows; backups/restores per customer.
* Existing business schema stays unchanged — every workspace database runs today's migrations.
* Cost: connection management per tenant (pool per hostname), migrations fan-out, a control-plane database,
  and resolving the workspace from the request host in `proxy.ts` before auth.
* **Not applied and not wired.** It must run on a *separate* control database, never on the current one.

### B. Shared database with `workspace_id` on every row
* Simpler operations, one migration run.
* Requires adding a non-null `workspace_id` to ~30 tables, backfilling the existing rows to a single
  "Nexyrium" workspace, adding it to every unique index, and threading it through every query and the
  scope helpers. Postgres row-level security should back it up.

**Recommendation:** A for selling to separate companies (data-isolation is a sales requirement), keeping the
scope helpers as the second line of defence. B only if many very small tenants are expected.

## Safe migration path (when approved)

1. Provision a separate control database and apply `001_control_plane.sql` there.
2. Insert one organization + workspace that points at the *current* database (no data moves).
3. Add host → workspace resolution in `proxy.ts`; keep the current database as the default when no
   workspace matches, so the existing deployment keeps working unchanged.
4. Move branding (logo, primary colour, display name) from env/CSS into the `organizations` row and expose it
   as CSS variables in the authenticated layout (the design system already reads `--color-primary`).
5. Department-level permissions: today department scope is per role (`*_read` + `user_departments`). For
   per-department rights (e.g. "approve Design expenses only"), add `department_id` (nullable) to
   `user_roles` — additive, nullable, no backfill needed.
6. Only after the above is verified, onboard a second workspace with its own database.

No step above deletes or rewrites existing business data. Steps 1–2 and 5 need explicit approval before
running against any shared or production database.

## Google Drive integration: future SaaS considerations

Migration `0010_google-drive-connections` creates `google_drive_connections` with a partial unique
index allowing **one active connection per database**. Under the recommended database-per-workspace
model (option A) that means one per workspace, so the table needs no `organization_id` /
`workspace_id`: organizations live in the separate control database and a cross-database foreign
key is impossible. If option B (shared database) is chosen instead, add `workspace_id` to this
table in the same migration that adds it everywhere else, and replace the index with
`UNIQUE (workspace_id) WHERE status = 'active'`.

The items below are not schema changes. They must be resolved before a second workspace is
onboarded:

1. **Workspace-specific Google OAuth redirect handling.** Sign-in and "Connect Google Drive" both
   use the Auth.js callback `/api/auth/callback/google`, and Google only accepts redirect URIs
   registered on the OAuth client. With one hostname per workspace, either register each
   workspace's `https://<hostname>/api/auth/callback/google` (and JavaScript origin, which the
   Picker also needs), or route all workspaces through one central auth host that returns the user
   to their workspace with a signed, single-use state. Pick one before onboarding; resolve the
   workspace from the request host before Auth.js runs.
2. **Workspace-specific token encryption.** `GOOGLE_TOKEN_ENCRYPTION_KEY` is one key for the whole
   process. Give each workspace its own key (held by the host secret manager and referenced from the
   control plane, like `database_secret_ref`), or derive a per-workspace key (HKDF of a master key
   with the workspace id) and bind the workspace id into the AES-GCM additional authenticated data
   (`src/lib/crypto/token-cipher.ts` already supports a purpose string; extend it to
   `google_drive_refresh_token:<workspace_id>`). A token copied between workspace databases must then
   fail to decrypt. Re-encrypt existing rows (or reconnect) when switching.
3. **Workspace-aware Google Drive client caching.** `src/features/integrations/google-drive/connection.ts`
   caches OAuth2 clients in a process-wide `Map` keyed by connection id. When one process serves
   several workspaces, key the cache by `workspace_id + connection id`, bound its size, and evict on
   disconnect/revoke for that workspace only, so one tenant's access token can never be used for
   another tenant's request.
4. **Workspace-aware database connection pools.** `src/db/index.ts` exports a single global pool.
   Replace it with a per-request resolver (host → workspace → database secret → pool), keep a bounded
   LRU of pools with small per-pool `max` (Neon: use the pooled `-pooler` host), and make every
   service obtain `db` from the request context instead of a module import. Background jobs must pass
   the workspace explicitly.
5. **Shared Google Cloud OAuth and Picker quotas.** All workspaces would share one Google Cloud
   project: one OAuth client, one consent screen and one Picker API key/`appId`. Drive API per-project
   and per-user rate limits, Picker key quotas and the consent-screen status (Testing caps test users
   and expires refresh tokens after 7 days; production needs a verified, published app) then apply
   across all customers. Before launch: publish and verify the consent screen, monitor Drive API
   quota in Cloud console, back off on 429/`userRateLimitExceeded` per workspace (already mapped to
   `QUOTA_EXCEEDED`), restrict the Picker key by every workspace origin, and decide whether large
   customers get their own Cloud project.
