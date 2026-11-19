# Nexyrium OS permissions

Authorization is enforced server-side through `src/lib/authorization`. A
session alone is not permission to access an application resource. Protected
pages use `requirePageActor` or `requirePagePermission`; protected API handlers
use `requireActor`, `requirePermission`, or `requireRecordPermission`.

## Roles

The supported role slugs are:

- `owner_admin` — full operational access, settings, role management, and
  invitation management.
- `founder` — full operational access.
- `department_lead` — department-oriented CRM, delivery, documents, reports,
  and invitation access.
- `sales` — CRM, lead, deal, quotation, and related document access.
- `delivery_contributor` — assigned delivery projects, tasks, documents, and
  limited lead visibility.
- `reviewer` — document/quotation review and audit visibility.
- `finance` — finance operations, approvals, quotations, and financial reports.
- `people_hr` — people operations, invitations, and people/settings visibility.
- `read_only_auditor` — read-only cross-record visibility and audit export.

Role identifiers and the default role-to-permission mapping are defined in
`src/lib/authorization/roles.ts`. The database remains the source of truth for
the roles and permissions assigned to a user.

## Permission families

Granular permission identifiers are defined in
`src/lib/authorization/permissions.ts`:

- `auth:*` — invitations and role management.
- `crm:*` — CRM, leads, clients, and deals.
- `crm:leads:convert` — transactional lead-to-client/deal conversion.
- `projects:*` and `tasks:*` — delivery work.
- `documents:*` — documents and review.
- `quotations:*` — quotation creation, updates, and approval.
- `finance:*` — finance reads, management, and approvals.
- `people:*` — people read and management.
- `reports:*` — report reading and management.
- `settings:*` — settings read and management.
- `audit_logs:*` — audit visibility and export.
- `integrations:meta:read` — Meta integration readiness and event summaries.
- `integrations:meta:manage` — retry failed Meta integration events.
- `projects:members:manage` — manage project team membership. Project owners
  with project-update access can also manage their own project team.
- `expenses:*` — submitter expense creation, updates, transitions, and private
  receipt uploads. `expenses:approve_own` is a separate explicit exception for
  policies that permit self-approval.
- `accounting:*` — chart-of-accounts, period, journal posting/reversal, and
  reconciliation foundation actions.
- `people:read` — directory-safe people profiles within the actor's scope.
- `people:manage` — update job title, employment status, manager, and
  department memberships without adding payroll or sensitive HR data.
- `reports:read` — dashboard/report aggregates and target reads, subject to the
  domain permissions required by each metric section.
- `reports:manage` — create and update departmental targets within the actor's
  authorized department scope.

Lead imports reuse `crm:leads:create`; every accepted import row is processed
through the unified lead-intake service and the same CRM authorization boundary.

## Scope rules

- `global` records are accessible only when the permission is granted; global
  roles such as Owner/Admin, Founder, and Read-only Auditor may cross records.
- `department` records require the actor to belong to the record's department.
- `owner` records require the actor to own the record, unless a global role
  applies.

These checks are data-access guards, not UI visibility rules. New feature
services must apply the same checks before querying or mutating records.

## Module 9 scope and separation of duties

- Expense submitters normally see their own records. Department leads see
  expenses in their departments. Finance and global roles can review the
  authorized cross-department expense set.
- Finance can approve or reject submitted expenses but cannot approve or reject
  its own submission unless the actor also has `expenses:approve_own`.
- Read-only auditors can read expenses and accounting records but cannot approve,
  post, reverse, close periods, or reconcile.
- Accounts, periods, journals, and reconciliations are global accounting records
  after the relevant accounting permission is granted.
- Expense approval is not ledger posting. Manual journal posting is separately
  permissioned and requires a reviewed account mapping.

## Module 10 report and people scope

- People reads return directory-safe fields only. People HR, global roles, and
  department-scoped users receive only the records allowed by their people
  scope; people mutations require `people:manage`.
- Report sections require both `reports:read` and the underlying domain read
  permission. Missing permissions produce an unavailable section, not a zero
  metric.
- Department filters are intersected with the actor's department memberships
  before any aggregate query runs.
- Target updates require `reports:manage` and are limited to the actor's
  authorized departments. Read-only auditors can read but cannot update.
