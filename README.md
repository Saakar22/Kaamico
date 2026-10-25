# Kaamico

**Local Skills. Fair Prices.** A hyperlocal marketplace for household services in India. Professionals set their own prices, and customers can agree a fair price with them through transparent offers.

> **Status: Phase 8 (Dashboards and tracking).** Customers can find a professional, request a booking (now or at a free time), agree a price through offers and counter-offers, then track the job step by step, approve or decline extra charges and see their bookings by tab. Professionals reply from their request inbox, run each job from its page (on the way, arrived, start code, extra charges, complete) and see today's jobs and the week's numbers on their dashboard. Both get in-app notifications. Admin review arrives in Phase 9 and payments in Phase 10. See [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for the full plan and roadmap.

## Tech stack

Next.js 16 (App Router, Turbopack, Cache Components) · React 19 · TypeScript (strict) · Tailwind CSS 4 · PostgreSQL 18 with Drizzle ORM · Zod · pino · Vitest · Playwright

## Prerequisites

- Node.js 24.22+ (see `.nvmrc`) and npm 11
- PostgreSQL 18 with a superuser password (used once to create the app role and databases). Either a local install, or Docker:
  ```bash
  docker run -d --name kaamico-pg -e POSTGRES_PASSWORD=postgres -p 5433:5432 postgres:18
  ```

## Getting started

```bash
npm ci
cp .env.example .env.local   # then edit .env.local
npm run db:create            # creates role "kaamico", kaamico_dev, kaamico_test + extensions
npm run db:reset             # applies migrations and loads demo data into kaamico_dev
npm run dev                  # http://localhost:3000
```

In `.env.local`, set:

- `DATABASE_ADMIN_URL`: your Postgres superuser connection, e.g. `postgres://postgres:<password>@localhost:5432/postgres` (port 5433 for the Docker container above)
- `DATABASE_URL` / `DATABASE_URL_TEST`: choose a password for the `kaamico` app role; `db:create` creates the role with it
- `SEED_ADMIN_PASSWORD`: the password the seeded admin accounts get (random and printed by `db:seed` if empty)
- `RATE_LIMIT_MULTIPLIER=20` for local development, so repeated test sign-ins are not rate-limited

Check the database connection at <http://localhost:3000/api/health>. It returns `200` with `"db": {"status": "up"}` when connected, and `503` otherwise.

## Database

- **Schema** lives in `src/db/schema/*` (Drizzle). After changing it, run `npm run db:generate` to create a migration in `src/db/migrations`, then `npm run db:migrate`.
- **Rules Drizzle cannot express** are in hand-written SQL migrations (`src/db/migrations/0001_integrity.sql`): the no-double-booking exclusion constraint, append-only tables, locked prices and offers, review eligibility, pricing-skill and refund-cap triggers. `src/db/integrity.int.test.ts` proves each one against a real database.
- **Tests** rebuild `DATABASE_URL_TEST` from migrations at the start of every `npm test` run. Without `DATABASE_URL_TEST`, database tests are skipped.
- **Concurrency:** the exclusion constraint guarantees no double booking, but racing writers can see deadlocks (`40P01`). Code that confirms bookings must lock the worker row first (`SELECT … FOR UPDATE`), which turns races into clean `23P01` conflicts.

### Demo data

`npm run db:seed` (or `db:reset`) replaces all data in `DATABASE_URL` with a deterministic demo set: 2 cities (Pune, Bengaluru), 32 localities, 10 categories, 38 services, 140 workers (3 to 7 comparable professionals for every service near Kothrud, Pune and Indiranagar, Bengaluru), 6 customers and about 480 bookings in every status, with offers, payments, ledger entries and reviews. Booking dates are relative to when you seed.

| Account                 | Login                 | Notes                                                       |
| ----------------------- | --------------------- | ----------------------------------------------------------- |
| Customer (Priya, Pune)  | `+91 90000 00001`     | Upcoming confirmed booking; a request waiting for Rakesh    |
| Customer (Aditya, Pune) | `+91 90000 00002`     | Negotiation waiting for his reply                           |
| Worker (Rakesh Patil)   | `+91 90000 00101`     | Verified, online; new request and a counteroffer pending    |
| Worker (pending)        | `+91 90000 00105`     | Verification submitted, awaiting review                     |
| Admin                   | `admin@kaamico.local` | Password: `SEED_ADMIN_PASSWORD` (sign in at `/admin/login`) |

Customers and workers sign in at `/login` with the mobile number; in development the 6-digit code is shown on screen (no SMS is sent). Any other Indian mobile number creates a new account. Verification documents in the seed are metadata only; no files exist.

## Discovery

- **Location** is a cookie (`kmc_loc`) holding a seeded locality or the device location. The header chip opens a sheet to change it; points more than 15 km from every serviceable locality are "not yet in your area".
- **Matching** (`src/modules/matching`) follows IMPLEMENTATION_PLAN.md §11.1: one SQL query filters verified, active, unpaused professionals with the skill and an active price, inside a bounding box and then a straight-line (haversine) distance within both the search radius and the professional's own travel radius. The radius widens 3 → 5 → 8 → 12 km until 5 are found. Ranking blends distance, Bayesian rating, reliability, price fit and a boost for new professionals, with a daily-rotating tie-break; the first page always includes a new professional when one qualifies, but never above someone closer, cheaper and better rated. Weights live in `config.ts`.
- **Availability:** "Available now" needs the professional online, active in the last 15 minutes and free for the whole job plus a 30-minute buffer. Otherwise cards show the next free start from weekly hours minus bookings and time off. Arrival times are distance-based estimates and say so.
- **Privacy:** public profiles and search results never include phone numbers, base locations or documents; unverified or suspended professionals return 404. Nearby price ranges are hidden until at least 3 professionals have set a price.
- **APIs:** `/api/v1/categories[/:slug]`, `/services/:id`, `/search?q=`, `/search/professionals`, `/localities`, `/professionals/:id[/reviews|/availability]`.
- **Caching:** the catalog and localities use `'use cache'` (minutes and hours), so `npm run build` prerenders catalog pages and needs `DATABASE_URL` to be reachable; runtime-only production rules (secrets, no simulation) are checked when the app starts, not during the build. After reseeding, restart `npm run dev` so cached pages pick up the new IDs.

## Worker supply and files

- **Setup checklist** (`/worker/onboarding` and the dashboard): profile, skills, work area, prices, hours, ID verification. Each step links to its page under `/worker/*`, and setup resumes at the first unfinished step.
- **Uploads** (`POST /api/v1/uploads`) are judged by their bytes, not their name or claimed type: JPEG, PNG and WebP up to 5 MB, and PDF up to 8 MB (ID documents only). EXIF, XMP and text metadata (including GPS) are stripped from photos, and uploads are limited to 20 an hour. Files go to `STORAGE_LOCAL_DIR` (default `./storage`, git-ignored, never under `public/`); identity documents live under their own `kyc/` prefix.
- **Identity documents** are never returned by any API: workers see metadata only, and only the last 4 characters of an ID number are stored. The only way to open a file is a 5-minute HMAC-signed link from `GET /api/v1/admin/verification-documents/:id/url` (admins only), and every link issued writes a `DOCUMENT_VIEWED` audit row.
- **Verification:** up to 6 documents; submission needs a profile, a skill, a work area, an ID document and a selfie. It is idempotent and sets the worker to PENDING with an outbox event. After a rejection, a worker can reapply after 7 days.
- **Online status:** only verified professionals can go online. While the dashboard is open it sends a heartbeat, so "available now" lapses about 15 minutes after the app closes. Pausing (today, 3 days or a week) hides a professional from new requests.
- **Not yet:** an S3/R2 storage driver (Phase 13), and purging files 90 days after a decision (the date is set when admins decide, in Phase 9).

## Bookings and negotiation

- **Request** (`POST /api/v1/bookings`, idempotent): the customer picks a professional, an address, now or a free time, and either the listed price or an offer. Even "accept the listed price" is an offer the professional must accept. In one transaction the worker row is locked and eligibility, travel distance, the slot (weekly hours, bookings, time off) and the limits (3 open requests per customer, 1 per professional) are re-checked; the price, address and commission are snapshotted. A busy slot returns `409 SLOT_TAKEN` with alternative times.
- **Negotiation** (IMPLEMENTATION_PLAN.md §11.2, rules in `src/modules/negotiation`): turn-taking, at most 3 offers per side (the last is labelled "Final offer"), customers never go down and professionals never go up, a floor of max(minimum charge, 40% of the listed price), fixed prices for non-negotiable services, and a required note for quotes over 150% of the listed price. Messages mask phone numbers, UPI IDs and emails.
- **Accepting** locks the booking, then the offer, then the worker, re-checks eligibility and time off, and confirms with the agreed price, slot and start code. The database's no-overlap constraint is the final guard: with 50 parallel confirmations for one slot exactly one wins and the rest get `409 SLOT_TAKEN` (`src/modules/bookings/concurrency.int.test.ts`).
- **Expiry:** on-demand offers last 10 minutes and requests 30; scheduled offers last up to 6 hours. Lapsed offers and requests expire lazily on every read and write, and `POST /api/internal/sweep` (bearer `CRON_SECRET`; `npm run sweep`) expires the rest and delivers queued notifications.
- **Lifecycle** (`src/modules/bookings/state-machine.ts`, one table used by the API and the tests): the assigned professional moves a job EN_ROUTE (scheduled jobs: at most 90 minutes early), ARRIVED, IN_PROGRESS (with the customer's 4-digit start code; 5 wrong tries lock it) and COMPLETED (not while an extra charge awaits the customer). Extra charges count only once the customer approves them.
- **Start codes** are derived from the booking ID and `AUTH_SECRET`, so the customer can always see theirs; only a hash is stored. Changing `AUTH_SECRET` changes the codes of active bookings.
- **Cancelling:** customers cancel free until the professional sets off, then a visit fee of min(₹99, minimum charge) is recorded (collected with payments in Phase 10); no cancelling once work has started. Professionals cancel a confirmed job with a reason (it counts against reliability), or a no-show 20 minutes after arriving. Declining a request cancels it so the customer can choose someone else.
- **Privacy:** before confirmation the professional sees the customer's first name, area and distance only; the full address appears once confirmed and disappears 24 hours after completion.

## Dashboards, tracking and notifications

- **Customer:** `/dashboard` puts what needs an answer first (offers, extra charges), then the job happening now, open requests and "book again". `/bookings` has Active, Upcoming, Past and Cancelled tabs (`GET /api/v1/bookings?tab=&cursor=`). `/bookings/[id]` shows the start code, a status timeline (status-based: no live location), the price with every extra charge, and a dialog to approve or decline a new charge; it refreshes every 10 seconds while the job is live and pauses when the tab is hidden.
- **Professional:** `/worker/dashboard` shows requests awaiting a reply, today's jobs and this week's completed jobs and job value. `/worker/bookings` has Today, Upcoming, Completed and Cancelled tabs; `/worker/bookings/[id]` has the address with a map link, one button for the next step, start-code entry, extra charges and the cancel / no-show options.
- **Notifications:** every booking change writes an outbox event in the same transaction. The dispatcher (`src/modules/notifications`) turns each event into in-app notifications for the other side, exactly once (failures back off 1, 2, 4… minutes and are parked after 5 tries). It runs from `POST /api/internal/sweep` and also lazily whenever someone reads their notifications, so nothing depends on a scheduler. The header bell polls `GET /api/v1/notifications/unread-count` every 30 seconds.

## Authentication

- **Customers and professionals** sign in with a phone OTP. Codes expire after 5 minutes, allow 5 attempts, and only the latest code for a number works. Only an HMAC of each code is stored. A first sign-in creates the account; the user then gives a name and chooses "book services" or "offer my services".
- **Admins** sign in at `/admin/login` with email and password (scrypt hashes). Admin powers require both the ADMIN role and a session from the admin sign-in, so a phone session never grants admin access. Admin sessions last 8 hours; other sessions last 30 days from last use.
- **Sessions** are opaque random tokens in an `HttpOnly`, `SameSite=Lax` cookie (`__Host-` prefixed over HTTPS). Only a SHA-256 of the token is stored.
- **Protection:** every mutating API checks the `Origin` header (CSRF). Rate limits are stored in Postgres: OTP requests (3 per number per 10 minutes, 10 per IP per hour), code checks, and admin sign-in (10 failures per email per 15 minutes).
- **Authorisation** is enforced on the server. `src/proxy.ts` only redirects visitors without a session cookie; layouts render a friendly "no access" screen; API handlers call `requireApiActor()`.

Why not an auth library? The plan's spike found that Better Auth's phone-number plugin needs a placeholder email and name for phone-only users. That would put fake data into `users`, so Kaamico uses a small amount of its own session code instead (the plan's documented fallback).

## Scripts

| Command                           | What it does                                                           |
| --------------------------------- | ---------------------------------------------------------------------- |
| `npm run dev`                     | Development server                                                     |
| `npm run build` / `npm start`     | Production build / serve it                                            |
| `npm run lint`                    | ESLint                                                                 |
| `npm run typecheck`               | Generate route types, then `tsc --noEmit`                              |
| `npm run format` / `format:check` | Prettier write / check                                                 |
| `npm test`                        | Unit and integration tests (Vitest)                                    |
| `npm run test:e2e`                | Browser tests (Playwright; run `npx playwright install chromium` once) |
| `npm run test:e2e:build`          | Browser tests against a production build (what CI runs)                |
| `npm run db:create`               | Create the app role, databases and extensions (idempotent)             |
| `npm run db:generate`             | Generate a migration from schema changes                               |
| `npm run db:migrate`              | Apply pending migrations (`-- --test` for the test database)           |
| `npm run db:seed`                 | Replace all dev data with the demo set                                 |
| `npm run db:reset`                | Drop everything, migrate and seed (dev database)                       |
| `npm run db:studio`               | Browse the database in Drizzle Studio                                  |
| `npm run sweep`                   | Expire lapsed requests and deliver notifications (needs `CRON_SECRET`) |
| `npm run check`                   | Lint, typecheck, format check and tests                                |

## Project structure

```
src/
  app/            Routes, layouts and API route handlers (/api/*); dev-only pages in app/dev
  components/
    ui/           Design-system primitives (Button, FormField, MoneyInput, Dialog/Sheet, …)
    patterns/     Page patterns (EmptyState, ErrorState, PageHeader, Stepper, StatTile)
    domain/       Kaamico concepts (badges, location chip, category/service/professional cards)
    layout/       Customer, worker and admin shells and navigation
    brand/        Logo
  config/         Brand, navigation, feature flags and validated environment (env.ts)
  modules/        Domain logic: auth, catalog, location, matching, availability, professionals,
                  workers, uploads, verification, addresses, bookings, negotiation
  db/             Drizzle client, schema/, migrations/, seed/ and integrity tests
  test/           Test helpers and database fixtures
  lib/            Shared helpers: cn, errors, HTTP wrapper, logger, money (paise), IST time,
                  private storage, signed file links, file-type sniffing and metadata stripping
  styles/         Design tokens (colours, radii, animations)
e2e/              Playwright tests
scripts/          Developer scripts
```

## Conventions

- **Money** is always integer paise (`src/lib/money.ts`). Rates are basis points.
- **API errors** use one envelope: `{ error: { code, message, details?, requestId } }`. Wrap route handlers with `route()` from `src/lib/http.ts`.
- **Environment** is read through `getEnv()`. In production, simulated OTP and payment modes are refused unless `ALLOW_SIMULATION_IN_PRODUCTION=true`.
- Server-only modules import `server-only`, so they cannot leak into client bundles.
- **Styling** uses the tokens in `src/styles/tokens.css` (e.g. `bg-brand-600`, `text-ink-600`); never hard-code hex colours in components. Combine classes with `cn()`.
- **Accessibility:** every page must pass the axe scan in `e2e/a11y.spec.ts` (WCAG 2.2 AA). Touch targets are at least 44px.
- Anything simulated (OTP, payments, payouts) must show `<SimulationBadge />`.
- `/dev/*` pages are disabled in production unless `ENABLE_UI_GALLERY=true` (set in CI only).
- **Protected pages** call `requirePageActor(role)` themselves (layout gates do not re-run on client navigations between sibling pages), sit inside their area's `loading.tsx` boundary, and export `instant = false` because they depend on the session.
- **Mutating API calls** that create things take an `Idempotency-Key` header (`withIdempotency()` in `src/lib/idempotency.ts`).

## Working on Windows

- Keep the repository **outside OneDrive** (e.g. `C:\dev\kaamico`). OneDrive locks files under `.next/` while syncing, which makes `next dev` fail with `EPERM` rename errors.
- Browser tests against `next dev` run with 2 workers, because the dev server renders slowly under heavy parallel load. `npm run test:e2e:build` tests a production build with full parallelism (as CI does).
