# Nexyrium OS database schema plan

## Status

Module 1 implements the Drizzle/PostgreSQL runtime and the foundational
identity, RBAC, department, and audit records in
`src/db/migrations/0000_initial-foundation.sql`. Module 2 adds the invite-only
`invitations` table in `src/db/migrations/0001_auth-invitations.sql`. Module 3
adds the CRM foundation in `src/db/migrations/0002_crm-foundation.sql`.
Finance tables are implemented in `src/db/migrations/0007_finance.sql`.
Module 4 adds the lead-intake event, source-identity, normalized identity-key,
and duplicate-review tables in `src/db/migrations/0003_normal_thunderbolts.sql`.
Module 5 adds import jobs/rows and safe Meta integration event receipts in
`src/db/migrations/0004_chief_squadron_supreme.sql`.
Module 6 adds private document metadata, provider object references, and
explicit lead/client/deal relationships in
`src/db/migrations/0005_curly_warhawk.sql`.
Module 7 adds projects, project membership/activity, tasks, and persisted in-app
notifications in `src/db/migrations/0006_moaning_reptil.sql`.
Module 8 adds quotations, invoices, payments, immutable document snapshots,
financial artifacts, and finance command/number sequence tables in
`src/db/migrations/0007_finance.sql`.
Module 9 adds expense workflows and the accounting foundation in
`src/db/migrations/0008_accounting-foundation.sql`.
Module 10 adds directory-safe people profiles and configurable department
targets in `src/db/migrations/0009_people-targets.sql`. Reports and dashboard
metrics are calculated from existing CRM, delivery, and finance records rather
than persisted mock values.

## Ownership and locations

- Drizzle schema modules live under `src/db/schema` and are exported through
  `src/db/schema/index.ts`.
- Drizzle Kit migration output lives under `src/db/migrations`.
- Server-side feature queries will be kept in the relevant
  `src/features/**/queries` directory and will use the database boundary rather
  than opening connections in UI code.
- `DATABASE_URL` is the only planned database connection input and must remain
  a server/CLI secret. The Aiven connection must use the provider's TLS
  settings.
- `DATABASE_SSL_CA_PATH` may point to the Aiven CA certificate. The default is
  `certs/aiven-ca.pem`; the certificate is intentionally ignored by Git and
  must be provisioned separately in each environment.

## Foundational schema inventory

The foundational migrations contain these tables:

- `users`: application identities with unique email addresses and active state.
- `roles`: reusable RBAC roles identified by unique slugs.
- `permissions`: reusable permission identifiers with unique slugs.
- `departments`: organizational departments with unique slugs.
- `user_roles`: many-to-many user/role assignments.
- `role_permissions`: many-to-many role/permission assignments.
- `user_departments`: many-to-many user/department assignments with a primary
  department flag.
- `audit_logs`: append-oriented actor/action/resource/outcome records with
  optional correlation, request metadata, and timestamps.
- `invitations`: hashed, expiring, single-use invite tokens linked to an
  approved role, optional department, and inviter.
- `leads`: contact/source/status records with ownership, department, notes,
  follow-up fields, and versioned normalized email/phone matching values.
- `lead_activities` and `lead_source_history`: lead timeline and source history.
- `lead_intake_events`: source-scoped idempotency claims, normalized signals,
  payload hashes, outcomes, and canonical lead linkage.
- `lead_source_identities`: provider/source identifiers mapped to canonical
  leads.
- `lead_identity_keys`: unique normalized email/phone identity claims used to
  arbitrate concurrent intake requests.
- `lead_duplicate_reviews`: candidate leads and review state for ambiguous
  intake matches.
- `lead_import_jobs` and `lead_import_rows`: server-validated file import jobs,
  mapped row payloads, row-level issues, intake outcomes, and retry state. The
  original uploaded file is not stored.
- `meta_integration_events`: signature status, provider event identity, safe
  processing metadata, failure state, retry count, and canonical intake/lead
  references for Meta deliveries. Raw webhook payloads and access tokens are not
  stored.
- `documents`: private application metadata, lifecycle state, uploader, and
  owner/department access scope.
- `document_storage_objects`: provider-neutral storage metadata with the current
  Google Drive object identifier and revision.
- `document_leads`, `document_clients`, and `document_deals`: explicit document
  relationships with the current CRM aggregates.
- `projects`: client/deal-linked delivery projects with owner, department,
  lifecycle, and date fields.
- `project_members` and `project_activities`: project team membership and an
  auditable activity timeline.
- `tasks`: project-scoped work items with assignment, priority, due date,
  lifecycle, and completion timestamp.
- `notifications`: provider-neutral persisted in-app notifications used by the
  project/task services without requiring email credentials.
- `clients`: client/company profiles with ownership and department scope.
- `client_contacts`: contacts belonging to a client.
- `client_leads`: explicit lead-to-client relationship history.
- `deals`: pipeline stage, expected value, owner, expected close date, and
  optional client/lead links.
- `expenses`: minor-unit employee expense claims with category, date, currency,
  department, optional client/project links, submitter, approval state, and
  approval/rejection reasons.
- `expense_receipts`: private receipt-to-document associations. Receipt content
  remains behind the provider-neutral storage adapter and application-mediated
  download routes.
- `accounting_accounts`: chart-of-accounts records with type, normal balance,
  hierarchy, active state, and postable state.
- `accounting_periods`: unique calendar-month open/closed periods. Closing is
  audited and is one-way in this module.
- `journal_entries`, `journal_entry_lines`, and `journal_entry_sources`: draft,
  posted, and reversed journals, balanced minor-unit lines, and explicit source
  references.
- `accounting_reconciliations` and `accounting_reconciliation_items`: manual
  account/period reconciliation sessions and external transaction matches.
- `people_profiles`: minimal job title, employment status, and manager
  relationship fields linked to the existing users/RBAC/department records.
- `department_targets`: one configurable count or minor-unit target per
  department, metric, and complete calendar month.

The three association tables are included because the requested roles,
permissions, and departments need explicit foreign-key relationships. The
invitation table is added by Module 2 for invite-only onboarding. Module 3 uses
separate canonical aggregates for leads, clients, and deals; it does not create
a generic CRM/EAV table. No seed CRM records are included.

## Implementation order

### 1. Establish the database runtime — implemented

Select and install the Drizzle ORM, Drizzle Kit, and PostgreSQL driver versions
that are compatible with the existing Next.js and Node runtime. Add the
server-only database client, connection lifecycle behavior, migration command,
and environment validation. The connection uses a conservative pool suitable
for Aiven and serverless-style deployment limits.

### 2. Confirm identity and organization context — implemented for invite-only OAuth

Choose the Auth.js session strategy and determine the identity/invitation model
needed by the application. Define only the identity, session, invitation, and
organization-scope records required by that decision. If an Auth.js adapter is
used, its required records must be mapped explicitly before generating a
follow-up migration. Module 2 uses Auth.js JWT sessions and links verified
Google identities to active application users by normalized email after an
invitation is accepted. Auth.js adapter/session tables are intentionally not
present because this flow does not use a database session adapter.

### 3. Define authorization data — foundational records implemented

Translate the approved RBAC matrix into role, permission, assignment, and
scope records only where the permissions document requires persistence. Keep
the policy vocabulary shared with `src/lib/authorization`; do not duplicate
role names in feature modules. Add uniqueness and foreign-key constraints after
the relationship model is reviewed. Module 1 implements `roles`, `permissions`,
`user_roles`, and `role_permissions`; the role and permission catalog is defined
in `src/lib/authorization` and documented in `docs/permissions.md`.

### 4. Define centralized audit records — foundational table implemented

Finalize the audit event contract before feature mutations are implemented.
The design should capture the actor, action, resource reference, outcome,
request/correlation identifier, and timestamps appropriate to the approved
retention policy. Sensitive request bodies, credentials, and private file
contents must not be stored by default. Module 1 implements the structural
`audit_logs` table; its service contract, retention policy, and write path are
Module 2 writes audit events for sign-in, invitation creation/acceptance, and
role replacement. A complete retention policy and audit-log read API remain
pending.

### 5. Define the CRM foundation — implemented in Module 3

Use the CRM PRD to approve the canonical lead, client, and deal concepts and
their relationships. Establish stable identifiers, lifecycle/status values,
ownership, organization scope, timestamps, and archival behavior before
building screens or endpoints. Module 3 implements the minimum requested
fields and relationships, with owner and department foreign keys, timestamps,
archive timestamps, indexes for list filters, and a non-negative deal-value
constraint. Module 4 adds the first reviewed intake fields and migration.
Provider-specific payloads, spreadsheet parsing, and review-resolution UI remain
pending.

### 6. Implement the unified lead-intake pipeline — first slice implemented

Map PRD v1.1 source payloads and normalization rules before choosing columns or
indexes. The planned sequence is:

1. retain the minimum source/intake metadata needed for traceability;
2. normalize the approved identity and contact signals;
3. evaluate deterministic and approved candidate-match rules;
4. persist duplicate candidates and review decisions where the workflow needs
   human intervention;
5. create or update the canonical CRM record through a service transaction;
6. emit an audit event for the outcome.

The first slice uses stable source identifiers first, then normalized phone and
email candidates, with ambiguous candidates stored for review. The exact
confidence policy, merge semantics, retention, and source-specific fields must
still be taken from PRD v1.1. They are deliberately not invented here.

### 7. Add operational work domains

After CRM and intake contracts stabilize, define the records needed for
projects, tasks, documents, quotations, finance, accounting, people, targets,
reports, and notifications. Each domain should begin with its aggregate and
ownership rules, then add relationships and indexes justified by an approved
query or workflow.

### 8. Add integration metadata and file references

Define provider-neutral records for private Google Drive references and any
approved Meta, WhatsApp, webhook, or import workflows. Store provider IDs,
ownership, access scope, and synchronization state only as required. Provider
credentials and access tokens do not belong in application tables unless an
explicit encrypted-secret design is approved.

## Migration guardrails

- Generate migrations from reviewed schema changes; do not hand-edit an
  already-applied migration.
- Keep each migration focused and reversible where the database permits it.
- Add foreign keys, uniqueness constraints, check constraints, and indexes as
  part of the reviewed domain change rather than after production data exists.
- Prefer immutable IDs and explicit timestamps; document timezone and deletion
  behavior for every aggregate.
- Scope protected records to the organization/tenant boundary selected by the
  identity design, and enforce that scope in queries as well as authorization.
- Avoid storing raw third-party payloads or personal data without a retention
  and access decision.
- Validate migration behavior against a disposable PostgreSQL environment and
  the Aiven-compatible connection settings before production rollout.

## Module 9 accounting guardrails

Expense approval does not automatically create a journal entry. A Finance user
must create a manual draft journal after account mapping has been reviewed.
Posting validates an open period, active/postable accounts, at least two lines,
and equal debit/credit totals in one transaction. Posted entries are immutable;
corrections use reversing entries. The schema is an accounting foundation, not a
claim of legal, statutory, tax, GAAP, or IFRS compliance.

## Definition of ready for the first CRM migration

The Module 3 migration is generated and reviewed and was applied to the
configured verification database during this task. Other deployment databases
must apply it through the reviewed migration workflow. The next migration is
ready only when the identity/session strategy, RBAC scope, audit contract,
naming conventions, environment validation, and rollback plan are documented
and reviewed.
