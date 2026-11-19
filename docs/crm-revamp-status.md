# NEXYRIUM CRM revamp — status

Last updated: 2026-11-19. Continues the earlier (Astra) work in place; nothing was reset, reverted or re-applied.

## 1. Audit findings (starting point)

* `src/features/crm/workspace-revamp.patch` and `src/features/people/offboarding-auth.patch` were **already applied**
  (`git apply --check -R` succeeds). `team-navigation.patch` and `reports/finance-pages.patch` are superseded by later
  edits. None were re-applied. The `.patch` files are kept for history.
* Baseline: `tsc` clean, 85/85 tests passing, ESLint **1 error** (`SavedNotice` setState-in-effect).
* Live database (Neon, read-only queries): 1 client, 3 open deals (INR 85,000 + 80,000 + 85,000), 2 invoices
  (1 paid, 1 draft), 1 posted payment (INR 31,500), 1 submitted expense (INR 236), 0 leads, 0 tasks, 0 journal entries,
  2 departments (Design, Technology). The Neon connection **works** from this machine (`npm run db:verify` → verified);
  the earlier EACCES issue did not reproduce.
* **The "₹2,500-only" issue:** deal `expected_value` is stored in **major** units (`numeric(14,2)`), while finance
  tables store **minor** units. Formatting the INR 2,50,000 pipeline with the minor-unit formatter divided it by 100 →
  "INR 2,500". All money now goes through `src/lib/format.ts` (`formatMajor` vs `formatMinor`), with a regression test.

## 2. Completed

| Area | What changed |
| --- | --- |
| Design system | Brand palette tokens in `globals.css` (forest green / orange / mint), NEXYRIUM primitives in `src/components/nx` (PageHeader, StatCard, Panel, StatusBadge, DepartmentChip, FilterBar, TableCard, Pager, EmptyState, KeyValue, ProgressBar). Legacy zinc/black/`dark:` classes mapped to tokens across 53 files. |
| Shell | New sidebar grouped CRM / Finance / Work / Insights / Workspace (permission-filtered, mobile drawer), top bar with global search (Ctrl K) and permission-aware "New" menu, skip link. Login page rebranded; dead Terms/Privacy links removed. |
| Founder dashboard | `FounderDashboard.tsx`: period presets (month, 30 days, quarter, Indian FY, all time) + custom range, department switch, 8 financial cards, 8 business cards, 12-month revenue-vs-expense chart (click → that month's payments), invoice-status donut, department cards (revenue, expenses, profit, pipeline), pipeline-by-stage, lead status and source charts, overdue tasks, pending tasks, follow-ups, recent payments, recent expenses, top clients, latest deals, recent activity, targets. Every card links to its module. All values are database queries. `/finance` and `/reports` reuse it with finance/report variants. |
| CRM modules | Leads, Clients, Deals rebuilt with filters (status/stage chips, department, source), owner and department names. New **Pipeline** board (`/crm/pipeline`) with stage moves. Lead, deal, client detail pages rebuilt; **Convert to client** button added (the API existed but had no UI). Contacts and Payments registers rebuilt (payments: status/department/date/client filters + posted/refunded/reversed totals). |
| Finance modules | Invoices list with Draft/Outstanding/Overdue/Paid tabs; "New invoice" from a client pre-selects it. Expenses list (status/department/date filters) and detail (amount was shown as raw minor units — fixed). |
| New pages | `/activities` (readable audit feed with record links), `/search` (leads, clients, deals, contacts, scope-aware), Settings → Departments (counts per module + add department). |
| UUIDs | Removed from every user-facing page found: deal list/detail, lead detail, expense detail, project list/detail, project member list, task assignee column; project member add is now a teammate picker. |
| Validation | Lead: name, company, phone (both the CRM form path and `/api/v1/leads`). Client: name, company, phone (create + lead conversion). Deal: name, value. Expense: title, amount, date. Task: title. Payment: amount, date, status (`posted`). Required fields show `*`. Covered by `tests/crm/validation.test.ts`. |
| Financial integrity | Collections = `posted` payments only (refunded/reversed excluded). Invoice list "paid" now counts only allocations from posted payments (previously counted reversed/refunded allocations). Outstanding = issued invoices − posted allocations. Pipeline excludes won/lost; closed-won value is shown separately from collected revenue. Expense totals count submitted + approved (drafts and rejected excluded). Currencies are never summed together. Net profit uses posted ledger lines when journals exist, otherwise is labelled "cash basis". |
| Misc fixes | ESLint error fixed; `/expenses`, `/activities`, `/search` added to the auth proxy matcher (pages were already permission-checked). |

## 3. Verification results

| Check | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm run lint` | 0 errors, 4 pre-existing warnings |
| `npm test` | 23 files, **97 tests pass** (12 new) |
| `next build` | Compiled, TypeScript passed, 76/76 pages generated; **the command then exited 1** at Next.js's own post-build security-advisory check for the installed `next@16.4.2`. Dependencies were not changed. |
| Browser | Login page verified on the running dev server (desktop and 375px mobile). **Authenticated pages not yet browser-verified** — sign-in is Google-only and needs the owner's account. |
| CRUD in a browser | Not run (same reason). Service-level CRUD tests pass. |

## 4. Remaining

* Authenticated browser pass over every page (desktop + mobile) once signed in.
* Resolve the Next.js security advisory (upgrade `next`), then re-run `npm run build`.
* shadcn/ui CLI and Aceternity/Framer Motion packages were **not** installed: the primitives follow shadcn conventions
  but are local, and motion is CSS-only. Installing them needs network access and the C: drive (currently full).
* Older secondary pages (Quotations, Documents, People, Targets, Projects, form pages) received the token/colour
  pass but not a full layout redesign. Documents still asks for a record ID when linking a file.
* Multi-organization / multi-workspace: reviewed and planned in `docs/saas-architecture.md`; **no migration applied**.
* Unused earlier components remain (`FounderSummary`, `MonthlyCashChart`, `OperationsFeed`, `components/dashboard/*`).
