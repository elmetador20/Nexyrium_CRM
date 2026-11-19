# API contracts

Application endpoints are versioned under `/api/v1`. Route handlers validate
input, enforce authentication/authorization, delegate to feature services, and
return JSON errors with a stable `error` and `code` shape.

## CRM endpoints

### Leads

```text
GET    /api/v1/leads
POST   /api/v1/leads
GET    /api/v1/leads/:leadId
PATCH  /api/v1/leads/:leadId
DELETE /api/v1/leads/:leadId       # archive, not destructive delete
POST   /api/v1/leads/:leadId/activities
POST   /api/v1/leads/:leadId/convert
```

List filters include `search`, `status`, `source`, `page`, and `pageSize`. Lead
conversion accepts client profile data and deal pipeline data and executes as a
single database transaction.

### Unified lead intake

```text
POST   /api/v1/lead-intake
PATCH  /api/v1/lead-duplicate-reviews/:reviewId
```

The endpoint requires an active internal session with lead-create permission.
The request supplies a stable `eventId` (or `Idempotency-Key` header), a source,
contact data, and optional source/provider metadata. It normalizes contact
signals, checks a source identifier before phone/email candidates, and executes
the event ledger, canonical lead, source history, identity claims, and audit
write in one transaction. Responses use `201` for `created`, `200` for
`linked_existing`, and `202` for `needs_review`. Reusing an event ID with a
different payload returns `409`.

Meta webhooks and CSV/XLSX imports call the same service after their source
authentication and parsing contracts are approved.

Duplicate reviews accept `link_existing`, `create_new`, or `reject` decisions.
The reviewer must have lead-update permission and access to the candidate lead's
owner/department scope.

### Lead imports

```text
GET    /api/v1/lead-imports/template
POST   /api/v1/lead-imports/preview
POST   /api/v1/lead-imports
GET    /api/v1/lead-imports/:importId
GET    /api/v1/lead-imports/:importId/rows
GET    /api/v1/lead-imports/:importId/errors
POST   /api/v1/lead-imports/:importId       # JSON { "action": "commit" }
POST   /api/v1/lead-imports/:importId/retry
```

Imports require lead-create permission. Preview parses CSV/XLSX and returns
headers, suggested mappings, sample rows, and a row count without creating an
intake event or lead. Job creation persists every mapped row, including invalid
rows and validation issues. Commit sends valid rows through the unified
lead-intake service; `created`, `linked_existing`, and `needs_review` remain
visible as separate row/job counts. Failed rows can be retried safely without
reprocessing successful rows. Invalid and failed rows can be downloaded as a
CSV error report using the `/errors` endpoint.

### Meta webhook and status

```text
GET    /api/v1/webhooks/meta
POST   /api/v1/webhooks/meta
GET    /api/v1/integrations/meta/events
GET    /api/v1/integrations/meta/events/:eventId
POST   /api/v1/integrations/meta/events/:eventId/retry
```

The webhook GET/POST routes use Meta's verification challenge and raw-body
signature verification rather than an internal Auth.js session. Status and
retry routes are protected by Meta integration permissions. Webhook payloads are
not returned by the status APIs.

### Documents

```text
GET    /api/v1/documents
POST   /api/v1/documents                 # multipart file + record metadata
GET    /api/v1/documents/:documentId
PATCH  /api/v1/documents/:documentId
DELETE /api/v1/documents/:documentId    # archive
GET    /api/v1/documents/:documentId/content
```

Document operations require document permissions and authorization against the
associated lead, client, or deal. The content endpoint is server-mediated and
returns private, non-cacheable content; it does not return a Google Drive URL or
credential.

### Projects and tasks

```text
GET    /api/v1/projects
POST   /api/v1/projects
GET    /api/v1/projects/:projectId
PATCH  /api/v1/projects/:projectId
DELETE /api/v1/projects/:projectId
POST   /api/v1/projects/:projectId/transition
GET    /api/v1/projects/:projectId/members
POST   /api/v1/projects/:projectId/members
DELETE /api/v1/projects/:projectId/members/:userId
GET    /api/v1/projects/:projectId/tasks
POST   /api/v1/projects/:projectId/tasks
GET    /api/v1/tasks
GET    /api/v1/tasks/:taskId
PATCH  /api/v1/tasks/:taskId
DELETE /api/v1/tasks/:taskId
POST   /api/v1/tasks/:taskId/transition
```

Project and task lists are paginated and support validated filters/sorting.
Task visibility is inherited from the parent project and project membership.
Transition endpoints enforce lifecycle rules separately from metadata updates.

### Clients

```text
GET    /api/v1/clients
POST   /api/v1/clients
GET    /api/v1/clients/:clientId
PATCH  /api/v1/clients/:clientId
DELETE /api/v1/clients/:clientId  # archive, not destructive delete
```

List filters include `search`, `page`, and `pageSize`. Client details return
profile data, contacts, linked leads, and linked deals.

### Deals

```text
GET    /api/v1/deals
POST   /api/v1/deals
GET    /api/v1/deals/:dealId
PATCH  /api/v1/deals/:dealId
DELETE /api/v1/deals/:dealId      # archive, not destructive delete
```

List filters include `search`, `stage`, `page`, and `pageSize`.

## Invoices and payments

```text
GET    /api/v1/invoices
POST   /api/v1/invoices
GET    /api/v1/invoices/clients?search=...
GET    /api/v1/invoices/:invoiceId
POST   /api/v1/invoices/:invoiceId   # { "action": "issue", "input": { "issue": true } }
POST   /api/v1/invoices/:invoiceId   # { "action": "void", "input": { "reason": "..." } }
POST   /api/v1/invoices/:invoiceId/pdf
GET    /api/v1/payments
POST   /api/v1/payments
```

Invoice forms accept user-facing decimal prices and convert them to integer
minor-unit line prices before calling the API. The API contract remains
minor-unit based, and server-side totals are recalculated from the submitted
quantity, unit price, discount, and tax values. Client search returns only
authorized, active client records. Invoice creation persists the invoice,
lines, and audit event in one transaction. Payment allocations must target an
authorized, issued invoice with a matching client and currency and cannot
exceed either balance.

## Authorization

Every CRM endpoint requires an active internal Auth.js session and the specific
resource permission. Collection queries apply owner, department, or global
scope before returning records. Detail and mutation services apply the same
scope again. The proxy is not the authorization source of truth.

## Expenses

```text
GET    /api/v1/expenses
POST   /api/v1/expenses
GET    /api/v1/expenses/:expenseId
PATCH  /api/v1/expenses/:expenseId
POST   /api/v1/expenses/:expenseId/transition
POST   /api/v1/expenses/:expenseId/receipts       # multipart file upload
GET    /api/v1/expenses/:expenseId/receipts/:documentId/content
```

Expense transitions use JSON such as `{ "action": "submit" }`,
`{ "action": "approve", "input": { "reason": "..." } }`, or
`{ "action": "reject", "input": { "reason": "..." } }`. Approval and
rejection reasons are required. Receipt content is private and server-mediated.
Submitters cannot approve or reject their own expense without the explicit
`expenses:approve_own` permission.

## Accounting foundation

```text
GET    /api/v1/accounting/accounts
POST   /api/v1/accounting/accounts
PATCH  /api/v1/accounting/accounts/:accountId
GET    /api/v1/accounting/periods
POST   /api/v1/accounting/periods
POST   /api/v1/accounting/periods/:periodId/close
GET    /api/v1/accounting/journal-entries
POST   /api/v1/accounting/journal-entries
GET    /api/v1/accounting/journal-entries/:entryId
POST   /api/v1/accounting/journal-entries/:entryId/post
POST   /api/v1/accounting/journal-entries/:entryId/reverse
GET    /api/v1/accounting/reconciliations
POST   /api/v1/accounting/reconciliations
GET    /api/v1/accounting/reconciliations/:reconciliationId
POST   /api/v1/accounting/reconciliations/:reconciliationId/items
POST   /api/v1/accounting/reconciliations/:reconciliationId/match
POST   /api/v1/accounting/reconciliations/:reconciliationId/complete
```

Journal posting and reversal require an `Idempotency-Key` header. Posting is
transactional and rejects unbalanced entries, closed periods, inactive or
non-postable accounts, and invalid source references. Posted entries cannot be
edited; reversal creates a new entry with swapped sides. Expense and invoice
records are not posted automatically. Manual journal source references are
available after mapping rules are reviewed.

## People, targets, and reports

```text
GET    /api/v1/people
GET    /api/v1/people/:userId
PATCH  /api/v1/people/:userId
GET    /api/v1/targets
POST   /api/v1/targets
PATCH  /api/v1/targets/:targetId
GET    /api/v1/reports/dashboard
```

People responses contain directory-safe fields only: name, work email, active
state, job title, employment status, manager display data, departments, and
role references. People mutations require `people:manage`; reads require
`people:read`. Targets require `reports:read` to read and `reports:manage` to
create/update. Dashboard sections require `reports:read` plus the relevant
domain read permission, so a caller receives an unavailable section instead of
another department's restricted aggregate.
