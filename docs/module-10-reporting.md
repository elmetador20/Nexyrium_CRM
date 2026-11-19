# Module 10: people, targets, reports, and dashboard

## People boundary

People profiles are intentionally small. The module stores job title,
employment status, manager relationship, department memberships, and role
references through the existing RBAC association tables. It does not store
payroll, compensation, home address, emergency contacts, identity documents, or
other HR-sensitive data because those requirements were not approved.

`people:read` returns directory-safe fields. `people:manage` can update the
profile, reporting relationship, and department memberships. Role assignment
remains behind the existing role-management permission and endpoint. The
service enforces scope server-side and writes an audit event for profile
changes.

## Targets

`department_targets` stores one configurable target per department, metric, and
complete calendar month. Supported metrics are:

- `payments_received_minor` — posted payments received in the month.
- `invoices_issued_minor` — issued, non-voided invoice totals in the month.
- `leads_created` — canonical non-archived leads created in the month.
- `tasks_completed` — non-archived tasks completed in the month under the
  department's current project attribution.

Money targets use integer minor units and a required currency. Count targets use
an integer count and no currency. The seed command creates configurable example
targets for the current UTC month (or `TARGET_SEED_PERIOD=YYYY-MM`):

- Technology: INR 50,000,000 minor units (₹5,00,000).
- Design: INR 20,000,000 minor units (₹2,00,000).

These are **targets, not actual revenue**. Actuals are calculated from the
underlying records at report time. Target writes require `reports:manage` and
are audited.

## Report date semantics

Report filters use inclusive UTC calendar dates:

- `periodFrom` and `periodTo` define the event window.
- `asOfDate` defines snapshot/overdue calculations.
- If omitted, the period starts on the first day of the current UTC month and
  ends on the current UTC date.

Timestamp queries use `[periodFrom 00:00:00Z, day-after-periodTo 00:00:00Z)`.
PostgreSQL date columns use inclusive comparisons. The response identifies the
timezone and reports `attribution: current_record_department` because this
module does not add historical department-assignment or stage-history tables.

## Dashboard metric definitions

- Lead created: canonical `leads` rows created in the event window, excluding
  archived rows. Intake events and source identities are never counted as
  leads.
- Lead funnel: current non-archived lead status snapshot. It is not historical
  stage progression.
- Lead source performance: first-touch source from the earliest
  `lead_source_history` row, with `unknown` when history is absent.
- Converted leads: `convertedAt` inside the event window. Cohort conversion in
  source performance means the lead was created in the window and converted by
  `asOfDate`.
- Open deals: non-archived deals whose stage is not `won` or `lost`, grouped by
  stage and currency. Deal values are never combined across currencies.
- Project/task status: non-archived projects and tasks in visible projects,
  each counted once. Overdue means due date is before `asOfDate` and the record
  is not completed/canceled. Due today is not overdue.
- Issued invoices: non-draft, non-voided invoices with `issuedAt` in the event
  window, grouped by currency.
- Collected payments: posted payments with `receivedAt` in the event window,
  grouped by currency. Allocations are not counted as payments.
- Outstanding receivables: issued, non-voided invoice totals less posted
  payment allocations, floored at zero and grouped by currency.
- Overdue receivables: outstanding receivables whose due date is before
  `asOfDate`.
- Department actuals: the source metric's event-window aggregate attributed to
  the record's current department. Unauthorized actuals are omitted rather
  than exposed through another section.

Each report section requires both `reports:read` and the relevant domain read
permission. Missing domain permission produces an unavailable section rather
than an empty zero, so permission denial is not confused with no records.

## Non-goals

This module does not add payroll, compensation, statutory reporting, tax
compliance, historical stage reconstruction, automatic invoice/expense ledger
posting, or cross-currency aggregation.
