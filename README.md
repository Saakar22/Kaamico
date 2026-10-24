# Kaamico

**Local Skills. Fair Prices.** A hyperlocal marketplace for household services in India. Professionals set their own prices, and customers can agree a fair price with them through transparent offers.

> **Status: Phase 1 (Foundation).** The app currently has a placeholder home page and a health check only. See [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for the full plan and roadmap.

## Tech stack

Next.js 16 (App Router, Turbopack, Cache Components) · React 19 · TypeScript (strict) · Tailwind CSS 4 · PostgreSQL 18 with Drizzle ORM · Zod · pino · Vitest · Playwright

## Prerequisites

- Node.js 24.22+ (see `.nvmrc`) and npm 11
- PostgreSQL 18 running locally, plus a superuser password (used once to create the app role and databases)

## Getting started

```bash
npm ci
cp .env.example .env.local   # then edit .env.local
npm run db:create            # creates role "kaamico", kaamico_dev, kaamico_test + extensions
npm run dev                  # http://localhost:3000
```

In `.env.local`, set:

- `DATABASE_ADMIN_URL`: your Postgres superuser connection, e.g. `postgres://postgres:<password>@localhost:5432/postgres`
- `DATABASE_URL` / `DATABASE_URL_TEST`: choose a password for the `kaamico` app role; `db:create` creates the role with it

Check the database connection at <http://localhost:3000/api/health>. It returns `200` with `"db": {"status": "up"}` when connected, and `503` otherwise.

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
| `npm run check`                   | Lint, typecheck, format check and tests                                |

## Project structure

```
src/
  app/            Routes, layouts and API route handlers (/api/*)
  config/         Brand config and validated environment (env.ts)
  db/             Database client (schema and migrations arrive in Phase 3)
  lib/            Shared helpers: errors, HTTP wrapper, logger, money (paise), IST time
  styles/         Design tokens
e2e/              Playwright tests
scripts/          Developer scripts
```

## Conventions

- **Money** is always integer paise (`src/lib/money.ts`). Rates are basis points.
- **API errors** use one envelope: `{ error: { code, message, details?, requestId } }`. Wrap route handlers with `route()` from `src/lib/http.ts`.
- **Environment** is read through `getEnv()`. In production, simulated OTP and payment modes are refused unless `ALLOW_SIMULATION_IN_PRODUCTION=true`.
- Server-only modules import `server-only`, so they cannot leak into client bundles.
