# ISX Leave Management Dashboard

An internal leave system for ISX Company. Employees request leave and track
their own balance; HR/Admin approve or reject, manage entitlements, configure
the office working calendar, and maintain Thai public holidays.

The defining constraint of this build is **privacy enforced by the database**.
Employee A cannot see Employee B's leave — not because a screen hides it, but
because PostgreSQL Row Level Security refuses to return the rows, even to a
hand-crafted SQL query issued over the application's own connection.

---

## Contents

1. [Quick start](#quick-start)
2. [Tech stack and why](#tech-stack-and-why)
3. [Architecture](#architecture)
4. [Database design](#database-design)
5. [Security model](#security-model)
6. [How leave days are calculated](#how-leave-days-are-calculated)
7. [Leave balance rules](#leave-balance-rules)
8. [Office working days](#office-working-days)
9. [Thai public holidays (Bank of Thailand)](#thai-public-holidays-bank-of-thailand)
10. [Audit log](#audit-log)
11. [Environment variables](#environment-variables)
12. [Creating the first admin](#creating-the-first-admin)
13. [Seed / demo data](#seed--demo-data)
14. [Testing](#testing)
15. [Deployment](#deployment)
16. [Running on Supabase instead](#running-on-supabase-instead)
17. [Assumptions and limitations](#assumptions-and-limitations)
18. [Future work the architecture already allows](#future-work-the-architecture-already-allows)

---

## Quick start

Requirements: **Node 20.11+** and **PostgreSQL 14+** (16 recommended).

```bash
# 1. install
npm install

# 2. create the two database roles and the database
#    (isx_owner = migrations, isx_app = RLS-enforced runtime)
npm run db:setup

# 3. configure
cp .env.example .env.local
cp .env.example .env          # the CLI scripts read .env
#    then set AUTH_SECRET:  openssl rand -base64 48

# 4. migrate + seed demo data
npm run db:reset

# 5. run
npm run dev            # http://localhost:3000
```

Sign in with any of the demo accounts (password `demo1234`):

| Account | Role | Entitlement |
| --- | --- | --- |
| `admin@demo.isx.local` | Admin | 15 days |
| `jane@demo.isx.local` | Employee | 15 days |
| `john@demo.isx.local` | Employee | 20 days |
| `mike@demo.isx.local` | Employee | 12 days |

The sign-in screen also has one-click demo buttons, which are automatically
disabled when `DEMO_MODE=false` or `NODE_ENV=production`.

Want to see the interface before installing anything? Open
[`design-preview/index.html`](design-preview/index.html) — a static snapshot
rendered from the app's real stylesheet and the seeded data.

### Useful commands

| Command | Does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run db:setup` | Create local Postgres roles + database |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:reset` | Drop, re-migrate, re-seed (never in production) |
| `npm run db:test` | Run the SQL security / business-rule suites |
| `npm test` | Run the Vitest unit tests |
| `npm run admin:create` | Create or promote an admin from env vars |
| `npm run holidays:import` | Import BOT holiday JSON files |
| `npm run typecheck` | `tsc --noEmit` |

---

## Tech stack and why

| Layer | Choice | Rationale |
| --- | --- | --- |
| Framework | **Next.js 15** (App Router), React 19 | Server Components keep every query on the server; Server Actions remove a hand-rolled API surface for mutations. |
| Language | **TypeScript**, strict | |
| Database | **PostgreSQL** | Row Level Security is the feature the privacy requirement is built on. |
| Driver | `pg` | No ORM: the security-critical logic is SQL, and an ORM would obscure it. |
| Auth | Signed JWT session cookie (`jose`) + scrypt password hashing | No external dependency; swaps cleanly for Supabase Auth (see below). |
| Validation | `zod` at the edge, **CHECK constraints + triggers in the database** | Client validation is UX; the database is the referee. |
| Styling | **A hand-authored CSS design system** (`src/app/globals.css`) | See the note below. |

### One deviation from the brief: no Tailwind / shadcn

The brief asked for Tailwind + shadcn/ui and invited a justified alternative.
This build uses a single hand-authored stylesheet instead, for three reasons:

1. **No CSS build step.** The app has zero styling dependencies, so
   `npm install` is smaller and there is no PostCSS/Tailwind config to keep in
   sync with the framework version.
2. **The design could be verified.** Because the stylesheet is a plain file,
   the real UI could be rendered and reviewed as static HTML
   (`design-preview/`) rather than described.
3. **Readable JSX.** Components carry semantic class names (`.kpi`, `.badge`,
   `.cal-cell`) instead of long utility strings, which keeps the calendar and
   table markup legible.

The component API deliberately mirrors shadcn/ui (`Card`, `CardHead`, `Badge`,
`Dialog`, `Field`, `EmptyState`), so **migrating to Tailwind later is
mechanical**: install Tailwind, then translate `globals.css` rules into
`@apply` blocks or utilities one component at a time. Nothing in the data,
auth or security layers is coupled to the styling choice.

---

## Architecture

```
Browser
  │  Server Actions (mutations) and RSC payloads (reads)
  ▼
Next.js server
  │  src/lib/db.ts  →  withUser(userId, fn)
  │                    BEGIN
  │                    SELECT set_config('app.current_user_id', <id>, true)
  │                    …queries…
  │                    COMMIT
  ▼
PostgreSQL  (connected as `isx_app`: not an owner, no BYPASSRLS)
  ├── RLS policies              who may see/change which rows
  ├── BEFORE triggers           business rules, day calculation, balances
  ├── AFTER triggers            audit log + in-app notifications
  └── CHECK / EXCLUDE           structural invariants
```

```
src/
  actions/        server actions (auth, leave, admin) — "use server"
  app/
    (app)/        signed-in shell: employee pages + /admin/*
    login/        sign-in
    api/          two small JSON routes (health, leave-requests)
    globals.css   the design system
  components/     UI primitives, calendar, tables, dialogs
  lib/
    db.ts         pool + withUser() — the single door to the database
    auth.ts       login, requireUser(), requireAdmin()
    session.ts    signed cookie
    queries.ts    all reads
    leave/calc.ts calculateLeaveDays() (preview mirror of the SQL function)
    errors.ts     database errors → safe, useful user messages
    date.ts       timezone-safe calendar-date helpers
db/
  migrations/     0001 schema · 0002 functions+triggers · 0003 RLS
  seed/           demo_seed.sql + holidays/th-2026.json
  tests/          three SQL suites, run against the runtime role
scripts/          migrate, seed, create-admin, import-holidays, db setup
tests/            Vitest unit tests
design-preview/   static snapshot of the UI
```

**There is no service-role client.** `src/lib/db.ts` exposes exactly one way to
reach the database, and it always binds the acting user. Admin power comes from
the user's `role` column as evaluated by `app.is_admin()` — not from a
privileged connection that could be misused by a bug.

---

## Database design

### Tables

| Table | Purpose | Notable decisions |
| --- | --- | --- |
| `users` | People and roles | `citext` email so `Jane@` and `jane@` are the same person. `password_hash` is null when Supabase Auth owns the credential. |
| `leave_types` | Annual / Personal / Sick / Other | A **table, not an enum**, so a new type is a row rather than a migration. `deducts_balance` allows future unpaid leave. |
| `leave_entitlements` | Days per `(employee_id, year)` | Unique on the pair. There is deliberately **no** "total leave" column on `users` — entitlement is yearly by construction. |
| `leave_requests` | The requests themselves | Stores `leave_days` **and** a `calc_breakdown` JSONB snapshot of the maths at submission time. Both immutable after insert. |
| `holidays` | Public + company holidays | `source` records provenance (`BOT`, `ISX`). `year` is a generated column for cheap filtering. |
| `office_days` | Versioned working calendar | 7 rows per "generation", each with `effective_from` / `effective_to`. Superseded generations are closed, never deleted. |
| `audit_logs` | Append-only history | No INSERT/UPDATE/DELETE grant for anyone; rows arrive only via a `SECURITY DEFINER` function. |
| `notifications` | In-app messages | Has an unused `emailed_at` column so an email dispatcher can be added later without a migration. |
| `app_settings` | Key/value tunables | Holds the default annual entitlement so admins can change it without a deploy. |

### Structural guarantees

* `leave_requests_date_order` — `end_date >= start_date`.
* `leave_requests_rejection_reason_required` — a rejected row **cannot exist**
  without a reason.
* `leave_requests_no_overlap` — a GiST `EXCLUDE` constraint preventing one
  employee from holding two live (pending or approved) requests over
  overlapping dates. This also makes a double-clicked submit harmless.
* `leave_entitlements (employee_id, year)` unique.
* `holidays (holiday_date, name)` unique — re-importing a year updates rather
  than duplicates.

### Deviations from the suggested schema

* `leave_type` is an FK to `leave_types(code)` rather than a free-text column.
* Added `calc_breakdown`, `cancelled_at`, `leave_year` (generated) on
  `leave_requests`; added `notifications` and `app_settings`.
* `office_days` keeps its own `effective_from`/`effective_to` per row, which is
  what makes point-in-time day calculation possible.

---

## Security model

### Two database roles

| Role | Used by | Powers |
| --- | --- | --- |
| `isx_owner` | `npm run db:migrate` / `db:seed` / `admin:create` | Owns the schema. Bypasses RLS. Never used by the web app. |
| `isx_app` | The Next.js runtime | `SELECT/INSERT/UPDATE/DELETE` grants only. **Not an owner, `NOBYPASSRLS`.** Every statement is rewritten by the policies. |

This mirrors Supabase's `postgres` vs `authenticated` split.

### How identity reaches the database

`app.current_user_id()` resolves, in order:

1. `request.jwt.claims ->> 'sub'` — the Supabase/PostgREST convention;
2. `app.current_user_id` — a **transaction-local** setting written by
   `withUser()` in local mode.

Being transaction-local matters: the value cannot leak to the next request that
borrows the same pooled connection.

### The policies (`db/migrations/0003_rls.sql`)

| Table | Employee | Admin |
| --- | --- | --- |
| `users` | SELECT own row only | full |
| `leave_requests` | SELECT own · INSERT own as `pending` · UPDATE own **while pending** | full |
| `leave_entitlements` | SELECT own | full |
| `holidays`, `office_days`, `leave_types`, `app_settings` | SELECT (company-wide, non-personal) | full |
| `audit_logs` | nothing | SELECT only |
| `notifications` | SELECT/UPDATE own | own only — an admin cannot read someone else's inbox |

Business rules that policies can't express live in
`app.validate_leave_request()`, a BEFORE trigger: legal status transitions,
recalculation of `leave_days`, the balance ceiling, immutability of submitted
requests, and "an employee may only file for themselves".

### Why this survives tampering

Changing a URL, editing an id in a form payload, replaying a request against
`/api/leave-requests?employeeId=<someone-else>`, or opening `psql` with the
app's own credentials all end at the same place: the policies. `db/tests/01_privacy.test.sql`
runs *as the runtime role* and asserts exactly this — 39 assertions covering
direct id lookups, email enumeration, date guessing, reason-text search,
subquery re-entry, cross-user writes, privilege escalation, and audit forgery.

`/api/leave-requests` is intentionally written **without** an ownership check —
it passes `employeeId` straight into the `WHERE` clause. Ask for a colleague's
id and you get `{"count":0,"requests":[]}`. That is the guarantee being
demonstrated, not an oversight.

### Other measures

* Passwords: scrypt (N=16384, r=8, p=1) with a per-user salt. Login runs the
  KDF even for unknown emails so timing doesn't reveal account existence.
* Sessions: HttpOnly, SameSite=Lax, `Secure` in production, 8h default.
* The role in the JWT is only a UI hint — `requireAdmin()` re-reads it from the
  database, so a demoted admin loses access on their next request.
* `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, strict referrer
  policy.
* Database errors are mapped to human messages in `src/lib/errors.ts`; raw SQL
  text, constraint names and stack traces never reach the browser.

---

## How leave days are calculated

**The rule:** a date is deducted when it *is a configured office day on that
date* **and** *is not an active holiday*. Weekends, any weekday ISX does not
work, and holidays are all free.

The authoritative implementation is `app.calc_leave_days(start, end)` in
`db/migrations/0002_functions.sql`. It returns the full breakdown:

```json
{
  "startDate": "2026-09-18", "endDate": "2026-09-22",
  "totalCalendarDays": 5,
  "officeDaysInRange": 2,
  "excludedNonOfficeDays": 3,
  "excludedHolidays": 0,
  "leaveDays": 2,
  "holidays": [], "days": [ … per-day rows … ]
}
```

The worked example from the brief, with ISX's Monday + Tuesday office days:

| Date | | Counted? |
| --- | --- | --- |
| Fri 18 Sep 2026 | not an office day | free |
| Sat 19 Sep | not an office day | free |
| Sun 20 Sep | not an office day | free |
| Mon 21 Sep | office day | **deducted** |
| Tue 22 Sep | office day | **deducted** |
| | | **2 leave days** |

`src/lib/leave/calc.ts` is a TypeScript **mirror** used only to render the live
breakdown in the request form. The client never sends a day count: on INSERT
the trigger recomputes the value in SQL and overwrites whatever arrived.
`tests/calc.test.ts` pins the mirror's behaviour, and the two implementations
were cross-checked against each other on twelve ranges (including a full year)
under three different system timezones.

All dates are handled as calendar dates (`YYYY-MM-DD` strings, UTC internally),
never as instants — 13 April is Songkran regardless of where the viewer is.

---

## Leave balance rules

For an employee and a year:

```
remaining = entitlement − approved                 ← the official balance
available = entitlement − approved − pending       ← what can still be booked
```

* **Only approved leave reduces the official balance.** Rejected and cancelled
  requests count for nothing, ever.
* **Pending leave does not reduce the balance, but it is reserved.** New
  requests are checked against `available`, so an employee cannot queue up more
  leave than they own. This is the documented answer to the brief's open
  question in §10.
* **The balance is re-checked at approval time.** Several requests can each be
  affordable alone but not together (or HR may have cut the entitlement since),
  so the trigger recomputes before allowing `pending → approved`.
* Entitlement resolution order: the `(employee, year)` row → otherwise the
  `default_annual_entitlement` app setting → otherwise 15.

Everything above lives in `app.leave_balance()` and the validation trigger.
No screen re-derives it.

---

## Office working days

Default: **Monday + Tuesday** (`db/seed/demo_seed.sql`), changeable at
*Settings → Office working days*, which calls `app.set_office_days(weekdays[],
effective_from)`.

That function **closes** the current generation (`effective_to = effective_from
- 1`) and opens a new one. Consequences, by design:

* Requests submitted **after** the effective date use the new configuration.
* Requests already submitted keep the `leave_days` and `calc_breakdown` they
  were created with. **History is never silently recalculated**, so a leave
  balance approved last quarter can still be explained.
* `app.is_office_day(date)` resolves against the generation in force *on that
  date*, so recalculating an old range reproduces the old answer.

Suite 3 asserts all three properties.

---

## Thai public holidays (Bank of Thailand)

Holidays live in the `holidays` table with a `source` column. The seeded 2026
set — 20 dates — is the Bank of Thailand financial-institution calendar,
including the two separately announced special holidays (2 January, and
16 October for Bangkok). See `db/seed/holidays/th-2026.json`, which records the
source URL and retrieval date.

**Adding a year is a data change, not a code change.** Two routes:

```bash
# CLI
npm run holidays:import -- db/seed/holidays/th-2027.json
```

or *Settings → Public holidays → Import year*, pasting the same JSON.

```jsonc
{
  "source": "BOT",
  "year": 2027,
  "sourceUrl": "https://www.bot.or.th/en/financial-institutions-holiday.html",
  "holidays": [
    { "date": "2027-01-01", "name": "New Year's Day", "nameTh": "วันขึ้นปีใหม่" }
  ]
}
```

Re-importing is idempotent — `(date, name)` is unique, so entries update in
place. Company-specific closures are added through the same screen with type
`company` and are badged distinctly from BOT dates. Any holiday can be disabled
(`active = false`) rather than deleted, so the historical record survives.

> **Note:** BOT publishes the following year's list late in the preceding year.
> At the time of writing (August 2026) the 2027 calendar is not yet available,
> which is precisely why the importer exists rather than a hardcoded table.

---

## Audit log

Written by database triggers, not by application code, so it cannot be
sidestepped by a route that forgot to log. Captured events: leave submitted /
approved / rejected / cancelled, employee added or edited, entitlement changed,
office days changed, holiday added or updated, leave type changed, sign-in, and
password change.

Each row records the actor, action, entity, and a JSONB before/after snapshot
(with `password_hash` stripped). Admins can read the log at *Admin → Audit log*;
**nobody** — including admins — holds INSERT, UPDATE or DELETE privileges on
`audit_logs`.

---

## Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | scripts only | Owner connection for migrations and seeding. |
| `DATABASE_APP_URL` | **yes** | Runtime connection. Must be a non-owner, `NOBYPASSRLS` role. |
| `AUTH_SECRET` | **yes** | ≥32 chars. `openssl rand -base64 48`. |
| `SESSION_TTL_SECONDS` | no | Default 28800 (8h). |
| `COMPANY_TIMEZONE` | no | Default `Asia/Bangkok`. |
| `DEFAULT_ANNUAL_ENTITLEMENT` | no | Default 15. Seeds `app_settings`. |
| `DEMO_MODE` | no | `true` enables one-click demo sign-in. Forced off when `NODE_ENV=production`. |
| `SETUP_ADMIN_NAME` / `_EMAIL` / `_PASSWORD` | for bootstrap | Consumed by `npm run admin:create` only. |

`src/lib/env.ts` throws at boot if anything required is missing or if
`AUTH_SECRET` is too short. No secret is ever imported into a client component.

---

## Creating the first admin

No credentials are hardcoded anywhere in the repository or the frontend.

```bash
SETUP_ADMIN_NAME="ISX HR" \
SETUP_ADMIN_EMAIL="hr@isx.co.th" \
SETUP_ADMIN_PASSWORD='<a long random password>' \
npm run admin:create
```

Safe to re-run: an existing account is promoted to admin and its password
reset. Passwords under 12 characters are refused. Sign in, then change the
password from *Profile*.

---

## Seed / demo data

`npm run db:seed` loads the BOT holidays plus four demo employees with a mix of
approved, pending, rejected and cancelled leave and three different
entitlements (15 / 20 / 12 days), plus one deactivated account.

Demo data is kept clearly separate from production:

* demo users live on `@demo.isx.local`;
* the script **refuses to run** when `NODE_ENV=production`;
* so does `db:reset`;
* production bootstrap is `admin:create` + `holidays:import`, which create no
  demo rows.

The seed inserts leave through the *real* validation trigger (setting
`app.current_user_id` per statement), so the demo data can only exist if it
satisfies the same rules a real user would face.

---

## Testing

### `npm run db:test` — SQL suites, run as the RLS-bound runtime role

| Suite | Assertions | Covers |
| --- | --- | --- |
| `01_privacy.test.sql` | 39 | §20 privacy and §2 RBAC |
| `02_validation.test.sql` | 24 | §21 validation and the §7 state machine |
| `03_balance_and_calendar.test.sql` | 29 | §10/§11 balances, §14 office days, §22 calculation |

**92 assertions, all passing.** Suites 2 and 3 run in a transaction that is
rolled back, so they leave the database untouched.

Highlights of what is actually asserted:

* the runtime role has neither `SUPERUSER` nor `BYPASSRLS`;
* an unauthenticated connection sees zero rows in every table;
* Jane sees exactly one `users` row and one distinct `employee_id` in
  `leave_requests`; John is unreachable by id, by email, by guessing his leave
  dates, and by searching his reason text;
* `app.leave_balance(John)` called by Jane returns the public default and zero
  usage — no leakage;
* Jane cannot file leave for John, self-approve, escalate her own role, invent
  holidays, change office days, or grant herself entitlement;
* neither Jane **nor an admin** can write to or delete from `audit_logs`;
* an admin cannot read another user's notification inbox;
* a deactivated employee cannot file leave even with a valid id;
* rejection without a reason, re-deciding a decided request, overlapping
  ranges, duplicate submissions, cross-year ranges, zero-office-day ranges and
  over-budget requests are all refused;
* approving 4 pending days moves `remaining` 18 → 14; rejected and cancelled
  leave move it not at all; approval is refused if the entitlement was cut
  underneath it;
* adding Wednesday as an office day changes new calculations to 5 days while
  the already-approved request stays at 4, with its original breakdown intact.

### `npm test` — Vitest unit tests

`tests/calc.test.ts` covers `calculateLeaveDays` against the brief's worked
example, holidays on and off office days, four office-day configurations,
whole-year self-consistency, and the timezone-safe date helpers.

### Cross-implementation check

The TypeScript and SQL implementations were compared on twelve ranges
(including 1 Jan – 31 Dec 2026) under `America/New_York`, `Pacific/Kiritimati`
and `Asia/Bangkok`. All five outputs — calendar days, office days, excluded
non-office days, excluded holidays, deducted days — agree in every case.

---

## Deployment

1. Provision PostgreSQL. Create the runtime role **without** `BYPASSRLS` and
   **without** table ownership (`scripts/setup-local-db.sh` shows the exact
   grants).
2. Set the environment variables. `NODE_ENV=production`, `DEMO_MODE=false`.
3. `npm ci && npm run build`
4. `npm run db:migrate` (as the owner role)
5. `npm run admin:create`
6. `npm run holidays:import`
7. `npm start`, behind TLS.

Works unchanged on Vercel, Fly.io, Railway, or a container. Point
`DATABASE_APP_URL` at a pooler (PgBouncer in *transaction* mode is fine —
`withUser()` uses `SET LOCAL`, which is pooler-safe).

Post-deploy check: `GET /api/health` returns the connected database user. If it
reports an owner or superuser role, RLS is not protecting you — fix the
connection string before going live.

---

## Running on Supabase instead

The schema and policies were written to move without edits:

1. Run `db/migrations/*.sql` in the Supabase SQL editor. The grant block picks
   up the `authenticated` role automatically.
2. `app.current_user_id()` already reads `request.jwt.claims ->> 'sub'` first,
   so Supabase Auth's JWT satisfies every policy as-is.
3. Create users through Supabase Auth and insert a matching `public.users` row
   with the same `id` (a trigger on `auth.users` is the usual approach).
   `password_hash` stays null and `src/lib/password.ts` becomes unused.
4. Replace `src/lib/auth.ts`'s `login()` with the Supabase client call and have
   `withUser()` set `request.jwt.claims` instead of `app.current_user_id`.

Nothing in `queries.ts`, the actions, or the UI changes.

---

## Assumptions and limitations

Decisions made where the brief left room:

1. **A request lives inside one calendar year.** Straddling 31 December is
   rejected with a clear message, because two years means two entitlements.
   Employees submit one request per year.
2. **All four leave types deduct from the same annual entitlement.** The
   `leave_types.deducts_balance` column exists so a future non-deducting type
   (unpaid leave, WFH) needs no migration. Sick leave is not given a separate
   quota in V1.
3. **Whole days only.** Half-day leave is out of scope; `leave_days` is
   `numeric(5,2)` so it can be added without a schema change.
4. **Pending leave is reserved against the bookable balance** but does not
   reduce the reported *remaining* figure. Both numbers are shown so the
   distinction is visible rather than surprising.
5. **A range with zero deductible days is rejected** rather than silently
   accepted as a 0-day request.
6. **Single-step approval.** Any admin can decide any request; there is no
   manager hierarchy.
7. **Employees cannot edit a submitted request** — they cancel and re-file.
   This is what keeps the audit trail honest.
8. **Employees cannot see who approved their leave** (they'd need to read
   another `users` row). Admins see the approver everywhere.
9. **Backdated leave is allowed** for admins and blocked in the employee form
   (`min=today`) — HR sometimes needs to record leave after the fact.
10. **2027 holidays are not seeded** because BOT had not published them at the
    time of writing. The importer is the intended route.
11. **No carry-forward, accrual, or pro-rating.** Entitlement is a number an
    admin sets per year.
12. **In-app notifications only.** Rows are written by a trigger and
    `notifications.emailed_at` is reserved for a future dispatcher.
13. **No rate limiting on sign-in.** Add it at the edge (or with
    `pg_stat_statements` + a lockout table) before exposing this to the public
    internet.

---

## Future work the architecture already allows

Each of these is a data or additive change, not a rewrite:

* **More leave types** — insert a `leave_types` row.
* **Half-day leave** — `leave_days` is already `numeric`.
* **Unpaid leave / WFH** — set `deducts_balance = false`.
* **Email or Slack notifications** — consume `notifications` rows where
  `emailed_at is null`.
* **Manager approval hierarchy** — add `users.manager_id` and widen the
  `leave_requests` policies to include it.
* **Departments** — add `users.department_id`; policies gain one OR clause.
* **Carry-forward** — add a column to `leave_entitlements` and one term to
  `app.leave_balance()`; every screen inherits it.
* **Reports / Excel export** — read-only queries over existing tables.

Because the balance, the day calculation and the access rules each exist in
exactly one place — in the database — extending them means changing one
function, not auditing every screen.
