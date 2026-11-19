# Module 9: expenses and accounting foundation

## Scope

Module 9 implements an expense workflow and the minimum accounting primitives
needed to record reviewed, manually posted journals. It does not claim legal,
statutory, tax, or GAAP/IFRS compliance. Professional accounting review is
required before using the foundation for regulated reporting.

## Expense workflow

Expenses contain a category, description, integer minor-unit amount, ISO-style
three-letter currency code, incurred date, submitter/owner, department, and
optional client/project links. Expense records use this lifecycle:

```text
draft -> submitted -> approved
                    \-> rejected
```

Submitters can create and edit their own draft expenses, attach private receipt
files, and submit them. Department leads and Finance can review expenses within
their authorized scope. A reviewer must provide a reason when approving or
rejecting. A submitter cannot approve or reject their own expense unless the
explicit `expenses:approve_own` permission is granted.

Receipt files use the existing provider-neutral storage boundary and private
Google Drive adapter. The browser receives an application-mediated content
route, not a provider URL or credential. Failed uploads leave metadata marked
failed and attempt provider cleanup.

## Accounting foundation

The accounting schema is intentionally separate from invoice/payment workflows:

- `accounting_accounts` defines a chart of accounts, account type, normal
  balance, parent, active state, and postable state.
- `accounting_periods` defines one-way open/closed calendar-month periods.
- `journal_entries` and `journal_entry_lines` define draft, posted, and
  reversed entries with integer minor-unit debit/credit values.
- `journal_entry_sources` records validated source references without pretending
  that every source has an automatic accounting mapping.
- `accounting_reconciliations` and
  `accounting_reconciliation_items` provide a manual reconciliation workflow for
  one account, period, and currency.

Before posting, a journal must have at least two lines, each line must have
exactly one positive side, every account must be active and postable, the date
must fall inside an open period, and total debits must equal total credits.
Posted entries and their lines are immutable. Corrections create a new posted
reversal entry with swapped debit/credit values; the original entry is marked
reversed and is never edited in place.

Posting and reversal operations use a transaction-scoped command ledger backed
by `finance_commands`. The same operation and idempotency key with the same
payload replays the original result; reuse with a different payload returns a
conflict. Accounting audit events are written in the same transaction as the
domain mutation.

## Deliberate non-automation

Invoices and expenses are **not automatically posted** to the ledger in this
module. A user with accounting management permission may create a manual draft
journal and attach an expense, invoice, payment, or other approved source
reference after mapping rules have been reviewed. Automatic account mapping,
tax treatment, bank feeds, payroll, FX, and full double-entry reporting remain
out of scope.

## Migration and checks

The Module 9 schema is in `src/db/schema/accounting.ts` and the generated
migration is `src/db/migrations/0008_accounting-foundation.sql`. Use the normal
workflow:

```bash
npm run db:check
npm run db:generate -- --name accounting-foundation
npm run db:migrate
npm run db:verify
```

Calculation, schema, idempotency canonicalization, and authorization tests live
under `tests/accounting/`. API details are documented in
`docs/api-contracts.md`; permission assignments are documented in
`docs/permissions.md`.
