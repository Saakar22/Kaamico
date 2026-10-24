# Kaamico

**Local Skills. Fair Prices.** A hyperlocal marketplace for household services in India. Professionals set their own prices, and customers can agree a fair price with them through transparent offers.

> **Status: Phase 2 (Brand and design system).** The app has a placeholder home page, a health check and the design system. Browse the components at <http://localhost:3000/dev/ui> while running `npm run dev`. See [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for the full plan and roadmap.

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
  app/            Routes, layouts and API route handlers (/api/*); dev-only pages in app/dev
  components/
    ui/           Design-system primitives (Button, FormField, MoneyInput, Dialog/Sheet, …)
    patterns/     Page patterns (EmptyState, ErrorState, PageHeader, Stepper, StatTile)
    domain/       Kaamico concepts (VerificationBadge, SimulationBadge, PriceLockedBadge)
    layout/       Customer, worker and admin shells and navigation
    brand/        Logo
  config/         Brand, navigation, feature flags and validated environment (env.ts)
  db/             Database client (schema and migrations arrive in Phase 3)
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
