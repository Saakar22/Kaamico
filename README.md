# Kaamico

**Local Skills. Fair Prices.** A hyperlocal marketplace for household services in India. Professionals set their own prices, and customers can agree a fair price with them through transparent offers.

> **Status: Phase 3 (Data layer).** The app has a placeholder home page, a health check, the design system (<http://localhost:3000/dev/ui>) and the full database schema with demo data. There are no product screens yet. See [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for the full plan and roadmap.

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

Check the database connection at <http://localhost:3000/api/health>. It returns `200` with `"db": {"status": "up"}` when connected, and `503` otherwise.

## Database

- **Schema** lives in `src/db/schema/*` (Drizzle). After changing it, run `npm run db:generate` to create a migration in `src/db/migrations`, then `npm run db:migrate`.
- **Rules Drizzle cannot express** are in hand-written SQL migrations (`src/db/migrations/0001_integrity.sql`): the no-double-booking exclusion constraint, append-only tables, locked prices and offers, review eligibility, pricing-skill and refund-cap triggers. `src/db/integrity.int.test.ts` proves each one against a real database.
- **Tests** rebuild `DATABASE_URL_TEST` from migrations at the start of every `npm test` run. Without `DATABASE_URL_TEST`, database tests are skipped.
- **Concurrency:** the exclusion constraint guarantees no double booking, but racing writers can see deadlocks (`40P01`). Code that confirms bookings must lock the worker row first (`SELECT … FOR UPDATE`), which turns races into clean `23P01` conflicts.

### Demo data

`npm run db:seed` (or `db:reset`) replaces all data in `DATABASE_URL` with a deterministic demo set: 2 cities (Pune, Bengaluru), 32 localities, 10 categories, 38 services, 40 workers, 6 customers and about 115 bookings in every status, with offers, payments, ledger entries and reviews. Booking dates are relative to when you seed.

| Account                 | Login                 | Notes                                                    |
| ----------------------- | --------------------- | -------------------------------------------------------- |
| Customer (Priya, Pune)  | `+91 90000 00001`     | Upcoming confirmed booking; a request waiting for Rakesh |
| Customer (Aditya, Pune) | `+91 90000 00002`     | Negotiation waiting for his reply                        |
| Worker (Rakesh Patil)   | `+91 90000 00101`     | Verified, online; new request and a counteroffer pending |
| Worker (pending)        | `+91 90000 00105`     | Verification submitted, awaiting review                  |
| Admin                   | `admin@kaamico.local` | Password set up in Phase 4                               |

Sign-in arrives in Phase 4. Verification documents in the seed are metadata only; no files exist.

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
| `npm run db:create`               | Create the app role, databases and extensions (idempotent)             |
| `npm run db:generate`             | Generate a migration from schema changes                               |
| `npm run db:migrate`              | Apply pending migrations (`-- --test` for the test database)           |
| `npm run db:seed`                 | Replace all dev data with the demo set                                 |
| `npm run db:reset`                | Drop everything, migrate and seed (dev database)                       |
| `npm run db:studio`               | Browse the database in Drizzle Studio                                  |
| `npm run check`                   | Lint, typecheck, format check and tests                                |

## Project structure

```
src/
  app/            Routes, layouts and API route handlers (/api/*); dev-only pages in app/dev
  components/
    ui/           Design-system primitives (Button, FormField, MoneyInput, Dialog/Sheet, …)
    patterns/     Page patterns (EmptyState, ErrorState, PageHeader, Stepper, StatTile)
    domain/       Kaamico concepts (VerificationBadge, SimulationBadge, PriceLockedBadge)
    layout/       Customer, worker and admin shells and navigation
    brand/        Logo
  config/         Brand, navigation, feature flags and validated environment (env.ts)
  db/             Drizzle client, schema/, migrations/, seed/ and integrity tests
  test/           Test helpers and database fixtures
  lib/            Shared helpers: cn, errors, HTTP wrapper, logger, money (paise), IST time
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
