# Nexyrium OS

Nexyrium OS is the internal operating system for Nexyrium Consultancy. This
repository contains the production-oriented application scaffold, the Module 1
PostgreSQL/Drizzle database foundation, the Module 2 authentication/RBAC
foundation, the Module 3 CRM foundation, and the Module 4/5 lead-intake,
CSV/XLSX import, and Meta integration slices. External Meta webhooks are not
activated automatically.

## Baseline

- Next.js 16 App Router with TypeScript under `src/`.
- PostgreSQL hosted on Aiven with Drizzle ORM and Drizzle Kit for the
  server-side data layer.
- Auth.js, Zod validation, RBAC, centralized audit logging, and private Google
  Drive integration are represented by explicit architecture boundaries.
- API route handlers are versioned under `/api/v1`.
- The unified lead-intake and deduplication flow has a dedicated feature area
  for the PRD v1.1 implementation pass.
- Module 1 includes a server-only pooled PostgreSQL client and foundational
  users, RBAC, departments, and audit-log tables with a generated migration.
- Module 2 includes invite-only Google OAuth, internal-user linking, server-side
  authorization helpers, audited invitations and role changes, and protected
  authentication/application routes.
- Module 3 includes protected lead, client, and deal CRUD APIs/pages, paginated
  filtering, activity/source history, audit events, and transactional lead
  conversion.
- Module 4 includes the shared normalized, idempotent lead-intake service and
  duplicate-review flow.
- Module 5 includes server-validated lead imports, retryable row jobs, signed
  Meta Lead Ads webhook handling, and protected integration status visibility.
- Module 6 includes a provider-neutral private document service backed by
  server-side Google Drive OAuth, explicit CRM document relationships, secure
  content responses, and mocked provider tests.
- Module 7 includes membership-aware projects and tasks, client/deal links,
  paginated filters, lifecycle transitions, activity timelines, and persisted
  in-app notifications without requiring email credentials.
- Module 8 includes quotations, invoices, payments, immutable document
  snapshots, private financial PDF artifacts, and integer minor-unit money
  calculations.
- Module 9 includes expense submission/approval/rejection, private receipt
  attachments, chart-of-accounts and accounting periods, balanced manual
  journal posting, immutable posted entries with reversals, and manual
  reconciliation primitives. Expenses and invoices are not automatically
  posted to the ledger.
- Module 10 includes restricted directory-safe people profiles, configurable
  monthly department targets, server-side report aggregates, and a permission-
  aware dashboard for CRM, delivery, finance, and target metrics.

See [`docs/architecture.md`](docs/architecture.md) for the dependency
boundaries and [`docs/database-schema.md`](docs/database-schema.md) for the
planned schema implementation order. See [`docs/meta-integration.md`](docs/meta-integration.md)
before configuring any external Meta webhook and [`docs/google-drive.md`](docs/google-drive.md)
before configuring private document storage. See
[`docs/module-9-accounting.md`](docs/module-9-accounting.md) for accounting
foundation guardrails and the explicit non-compliance/non-automation boundary.
See [`docs/module-10-reporting.md`](docs/module-10-reporting.md) for metric
definitions, UTC date semantics, target examples, and people-data limits.

## Local development

Use the repository's npm lockfile and scripts:

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open <http://localhost:3000>. Private environment values belong in
`.env.local`; do not prefix private secrets with `NEXT_PUBLIC_`.

## Checks

The scripts currently provided by `package.json` are:

```bash
npm run lint
npm run build
npm run db:check
npm run db:generate -- --name example-migration
npm run db:migrate
npm run db:seed
npm run db:verify
npm run typecheck
npm test
```

The Next.js build performs the available TypeScript validation as part of its
check. `db:migrate`
requires a real `DATABASE_URL` and the generated migration should be reviewed
before it is applied. `db:seed` inserts the supported roles and permissions
idempotently; it does not create a user or password. `db:verify` runs a
sanitized `select 1` connection check.

## Project layout

```text
src/app/          App Router pages, route groups, and versioned API handlers
src/components/   Shared UI, layout, form, and feedback components
src/features/     Feature-owned schemas, services, queries, and UI
src/db/           Server-side schema and migration boundary
src/lib/          Cross-cutting auth, authorization, audit, and integration helpers
src/types/        Shared type definitions
docs/             Architecture, schema, API, permissions, and deployment notes
scripts/          Repeatable repository and operational scripts
```

Only route files and feature logic should make a route or workflow executable.
Unimplemented modules retain structural placeholders so the architecture stays
visible without introducing incomplete production flows.
