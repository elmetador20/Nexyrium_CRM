# Nexyrium OS architecture

## Scope of this document

This document defines the boundaries for Nexyrium OS. The current repository
contains the application structure, the Module 1 database foundation, the
Module 2 authentication/authorization foundation, the Module 3 CRM foundation,
and the first unified lead-intake, import, Meta integration, private
document-storage, finance, and Module 9 accounting-foundation slices.
Statutory accounting, tax compliance, and automatic invoice/expense posting
are intentionally not implemented.

## Runtime and routing model

The application uses the Next.js App Router under `src/app`.

- `src/app/layout.tsx` is the existing root layout and remains the global
  document boundary.
- `src/app/(public)` groups unauthenticated pages such as login and invite.
  Parenthesized route groups organize the code without adding a URL segment.
- `src/app/(authenticated)` groups signed-in application pages. Its layout
  requires a current active internal user before rendering children.
- `src/app/api/v1` is the only planned public API namespace. Each child area
  will expose Next.js `route.ts` handlers when its contract is approved.
  Empty directories in the scaffold are not routes because they do not contain
  a `page.tsx` or `route.ts` file.

The route folders are kept thin. They describe URL composition and page or
HTTP transport concerns; they do not own database queries or domain rules.

`src/app/api/auth/[...nextauth]/route.ts` exposes Auth.js's public protocol
endpoints. The versioned application endpoints under `src/app/api/v1` must use
the server authorization helpers; the proxy is only an early request filter and
is not the authorization source of truth.

## UI boundary

- Pages and layouts are Server Components by default. They may read server-side
  feature data and pass serializable results to interactive components.
- `src/components` contains reusable presentation primitives. `ui/` is for
  generic controls, `layout/` for application chrome, `forms/` for shared form
  composition, and `feedback/` for loading, empty, error, and notification UI.
- Feature-specific UI belongs under its feature folder, not in a global
  component bucket.
- A file becomes a Client Component only when it needs browser APIs, state, or
  event handlers. Client Components must never import database, credential,
  Auth.js server, or private integration modules.

## API route-handler boundary

Each future handler under `src/app/api/v1/**/route.ts` should do only the
transport work:

1. Establish request metadata and a correlation/audit context.
2. Authenticate the request and resolve the current actor.
3. Authorize the requested action against the actor's role and resource scope.
4. Parse path, query, and body input with the feature's Zod schema.
5. Call one feature service and map its result or typed error to the versioned
   HTTP response contract.

Handlers must not contain SQL, Drizzle query construction, deduplication rules,
or provider-specific Google Drive/Meta/WhatsApp logic. They also must not
return secrets or unfiltered database records to the browser.

## Feature-service boundary

`src/features` owns business capabilities. A feature may contain:

- `schemas/`: input and output validation contracts.
- `services/`: use-case orchestration and business invariants.
- `queries/`: server-side read/write adapters for that feature.
- `components/`: feature-specific UI that composes shared components.
- `deduplication/` and `normalization/`: isolated lead-intake rules.

Services are the application boundary used by both UI server components and
API handlers. They accept validated, typed inputs, enforce domain rules, call
queries or integrations through explicit interfaces, and return safe domain
results. A service should not depend on a particular HTTP framework response.

The lead-intake feature is intentionally separate from CRM lead screens. It
normalizes inbound records, evaluates source-identifier/email/phone candidates,
persists ambiguous candidates for review, and creates or links a canonical CRM
record through one transaction. CSV/XLSX import and verified Meta lead events
adapt their inputs into this service; they do not create leads directly.

Module 3 owns the first CRM vertical slice: lead, client, and deal schemas,
queries, services, APIs, and pages. Lead conversion is a service-level
transaction that creates the client/deal relationship and updates the lead as
one unit of work.

## Authorization boundary

`src/lib/authorization` is the single policy boundary for RBAC and resource
scope checks. It exposes policy decisions to services and route handlers; UI
checks are only for presentation and must not be treated as enforcement.

- Authentication answers **who** the actor is.
- Authorization answers **whether** that actor may perform an action on a
  resource in the current scope.
- Services and API handlers must enforce authorization server-side before any
  protected read or write.
- `requireActor` verifies an Auth.js session, resolves its internal user, and
  checks that the user is active. `requirePermission` adds the permission check,
  while `requireRecordPermission` adds owner or department record scope.
- Role and permission identifiers should be defined once and reused by policy
  checks, navigation visibility, and audit records.

## Database boundary

All PostgreSQL access is server-only:

- `src/db/schema` is the Drizzle schema ownership boundary.
- `src/db/migrations` contains the generated foundational migrations and is
  reserved for future generated, reviewed migration files.
- `src/db/index.ts` owns the server-side Drizzle client and conservative
  PostgreSQL pool. `src/db/client.ts` remains a compatibility re-export for
  existing imports.
- Feature `queries/` modules may call the database boundary, but pages and
  Client Components may not import it directly.

The Aiven connection string belongs in `DATABASE_URL` and must never be
exposed through a `NEXT_PUBLIC_` variable. Drizzle configuration is for CLI
use and does not become browser code.

## Cross-cutting concerns

- `src/lib/audit` is the centralized audit-event boundary. Mutating services
  should emit actor, action, resource, outcome, and correlation metadata after
  the audit contract is defined.
- `src/lib/storage` and `src/features/integrations/google-drive` are the
  server-only private-file boundaries. Business features depend on the
  provider-neutral storage adapter, while the Google Drive implementation owns
  SDK/authentication details. The browser receives authorized file metadata or
  application-mediated content responses, not Drive credentials or unrestricted
  provider URLs.
- `src/lib/validation` holds shared validation helpers; feature schemas remain
  close to the feature.
- `src/lib/observability` owns logging and tracing conventions without leaking
  request bodies, credentials, or private file contents.
- `src/lib/ai`, `src/lib/pdf`, and `src/lib/utils` are shared support seams,
  not alternate locations for feature business rules.

## Dependency direction

```text
UI pages/components
        ↓
route handlers / server actions (transport)
        ↓
feature services (use cases and invariants)
        ↓
authorization policies + feature queries/integration ports
        ↓
server-only database and external providers
```

Lower layers must not import upward into route handlers or UI. Cross-cutting
modules may be used through narrow interfaces, while secrets and provider
clients remain on the server.

## Current implementation boundary

Module 1 establishes the server-only database client, environment validation,
Drizzle Kit configuration, and the foundational identity/RBAC/audit schema.
Module 2 establishes invite-only Google OAuth, internal-user linking, active
session checks, centralized authorization helpers, audited invitations and role
changes, and the invitation migration. Module 3 establishes the CRM vertical
slice. Module 4 adds the shared manual lead-intake service, normalization,
idempotency ledger, identity keys, and duplicate-review persistence. Module 5
adds server-side import jobs, CSV/XLSX validation, Meta webhook verification,
persisted provider events, and protected integration status visibility. Module 6
adds provider-neutral document services backed by private server-side Google
Drive storage, explicit CRM relationships, and authorized content delivery.
Module 7 adds membership-aware project/task services, explicit state
transitions, activity timelines, pagination, and provider-neutral in-app
notifications. Module 8 adds quotations, invoices, payments, immutable financial
snapshots, and private financial artifacts. Module 9 adds expense submission,
approval/rejection, private receipt attachments, chart-of-accounts and period
records, balanced manual journal posting, immutable posted journals with
reversals, and manual reconciliation primitives. Expense and invoice records do
not automatically create journal entries; mapping rules must be reviewed before
manual posting. Module 10 adds a minimal people-profile boundary, configurable
department targets, server-side report aggregates, and a permission-aware
dashboard. The dashboard calls feature services rather than constructing SQL in
page code; each metric section applies both domain permissions and record scope
before aggregation. People data intentionally excludes payroll and unnecessary
sensitive personal information.
