<div align="center">

<img src="public/icons/icon-192.png" alt="Kaamico logo" width="72" height="72" />

# Kaamico

**Local Skills. Fair Prices.**

A hyperlocal marketplace for household services in India. Professionals set their own prices,<br />
and customers agree a fair price with them through transparent offers.

[![CI](https://github.com/Saakar22/Kaamico/actions/workflows/ci.yml/badge.svg)](https://github.com/Saakar22/Kaamico/actions/workflows/ci.yml)
![Next.js 16](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![PostgreSQL 18](https://img.shields.io/badge/PostgreSQL-18-4169E1?logo=postgresql&logoColor=white)
![WCAG 2.2 AA](https://img.shields.io/badge/WCAG-2.2%20AA-0b6e4f)

[Features](#features) · [Screenshots](#screenshots) · [Tech stack](#tech-stack) · [Getting started](#getting-started) · [Architecture](docs/architecture.md)

<br />

<img src="docs/screenshots/home.webp" alt="Kaamico home page: search, category tabs and a professional at work" width="100%" />

</div>

## Why Kaamico

Booking a plumber or an electrician in India usually means calling around and haggling, with no idea what a fair price is. Kaamico makes the price the centre of the product:

- **Professionals set their own prices.** Customers compare real prices side by side, with ratings and distance.
- **Prices are negotiated in the open.** Book at the listed price or make an offer. Each side gets three offers, and the last one is marked "Final offer".
- **The agreed price is locked.** It can't change after confirmation, and any extra charge needs the customer's approval.

## Features

| For customers                                                                                  | For professionals                                       | For Kaamico admins                                        |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------- |
| Search by service or category near a chosen locality                                           | Guided setup: profile, skills, work area, prices, hours | ID-verification queue with signed, audited document links |
| Compare professionals by price, rating, distance and availability                              | Accept, decline or counter requests                     | Bookings, disputes, refunds and payouts                   |
| Book now or pick a day and time; quick match sends one request to several nearby professionals | Go online, pause, and run each job step by step         | Funnel and supply analytics by locality                   |
| Job progress updates, with a start code so work begins only when the customer is there         | Earnings ledger with weekly trends and payout requests  | Review moderation, user suspension and catalog management |
| Pay in cash or online, then get a numbered receipt and leave a review                          | Reply to reviews and report unfair ones                 | An append-only audit log of every admin action            |

Across the whole product:

- English and Hindi (the admin console is English only).
- Light and dark themes.
- Installable as an app on phones.
- Live updates over server-sent events.
- Keyboard and screen-reader support, tested against WCAG 2.2 AA.

## Screenshots

### Finding a professional

<img src="docs/screenshots/categories.webp" alt="Category tiles with typical starting prices" width="100%" />

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/category.webp" alt="Plumbing category page with services and nearby price ranges" /></td>
    <td width="50%"><img src="docs/screenshots/search.webp" alt="Search results for tap repair with filters, sorting and quick match" /></td>
  </tr>
  <tr>
    <td align="center"><sub>Category page with real price ranges nearby</sub></td>
    <td align="center"><sub>Ranked results with filters and quick match</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/profile.webp" alt="A professional's public profile with prices and free times" /></td>
    <td width="50%"><img src="docs/screenshots/book-time.webp" alt="Booking step with day chips and a grid of start times" /></td>
  </tr>
  <tr>
    <td align="center"><sub>Public profile with prices, rating and free times</sub></td>
    <td align="center"><sub>Booking: choose a day and start time</sub></td>
  </tr>
</table>

### Agreeing a fair price

<img src="docs/screenshots/pricing-demo.webp" alt="The home page's animated explanation of how fair pricing works" width="100%" />

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/negotiate.webp" alt="Negotiation thread with offers, a counteroffer and accept button" /></td>
    <td width="50%"><img src="docs/screenshots/booking.webp" alt="Confirmed booking with a 4-digit start code and progress timeline" /></td>
  </tr>
  <tr>
    <td align="center"><sub>Negotiation: offers, counteroffers, a locked price</sub></td>
    <td align="center"><sub>Confirmed booking with start code and live progress</sub></td>
  </tr>
</table>

### On a phone

<img src="docs/screenshots/phones.webp" alt="Home, search results and a booking on a phone" width="100%" />

### For professionals and admins

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/worker-dashboard.webp" alt="Professional dashboard with earnings, requests and online status" /></td>
    <td width="50%"><img src="docs/screenshots/worker-earnings.webp" alt="Earnings ledger with weekly chart and earnings by service" /></td>
  </tr>
  <tr>
    <td align="center"><sub>Professional dashboard</sub></td>
    <td align="center"><sub>Earnings, fees and trends from the ledger</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/admin.webp" alt="Admin overview with queues and latest bookings" /></td>
    <td width="50%"><img src="docs/screenshots/admin-analytics.webp" alt="Admin analytics: funnel, request outcomes and supply by locality" /></td>
  </tr>
  <tr>
    <td align="center"><sub>Admin overview</sub></td>
    <td align="center"><sub>Funnel and supply analytics</sub></td>
  </tr>
</table>

<sub>Screenshots are of the real app running on seeded demo data. Photos are from Unsplash and Pexels (see <a href="public/images/CREDITS.md">credits</a>).</sub>

## Tech stack

| Layer                  | Choice                                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| App                    | [Next.js 16](https://nextjs.org) (App Router, Turbopack, Cache Components), React 19, TypeScript (strict) |
| UI                     | Tailwind CSS 4 with design tokens, Radix primitives, Lucide icons, Anek and Inter type                    |
| Data                   | PostgreSQL 18, [Drizzle ORM](https://orm.drizzle.team), hand-written SQL for integrity rules              |
| Validation and logging | Zod, pino                                                                                                 |
| Payments               | Simulated by default; Razorpay in test mode                                                               |
| Files                  | Private S3-compatible storage (Cloudflare R2, AWS S3 or SeaweedFS) with signed links                      |
| Testing                | Vitest (unit and database integration), Playwright (end to end and axe accessibility)                     |
| Delivery               | Docker image, GitHub Actions CI and release workflows, gitleaks                                           |

### Engineering highlights

- **No double bookings, ever.** A Postgres exclusion constraint is the final guard. In a test, exactly one of 50 parallel confirmations for the same slot succeeds.
- **Money is exact.** Amounts are integer paise, and an append-only ledger posts earnings, fees, refunds and payouts. Receipts are numbered per Indian financial year.
- **Fair, explainable matching.** One SQL query ranks professionals by distance, Bayesian rating, reliability, price fit and a boost for newcomers.
- **Privacy by default.**
  - Phone numbers, base locations and ID documents never reach public pages.
  - Chat messages mask phone numbers and UPI IDs.
  - Every view of an identity document is audited.
- **Accessible and fast.** Every page passes an axe scan for WCAG 2.2 AA at phone and desktop widths, and a full booking can be completed with only a keyboard.

More in **[docs/architecture.md](docs/architecture.md)**.

## Getting started

**Prerequisites:**

- Node.js 24.22+ (see `.nvmrc`) and npm 11.
- PostgreSQL 18, either a local install or Docker:

```bash
docker run -d --name kaamico-pg -e POSTGRES_PASSWORD=postgres -p 5433:5432 postgres:18
```

```bash
npm ci
cp .env.example .env.local   # then fill in the values below
npm run db:create            # creates the "kaamico" role, kaamico_dev, kaamico_test
npm run db:reset             # applies migrations and loads the demo data
npm run dev                  # http://localhost:3000
```

In `.env.local`, set:

| Variable                            | Value                                                                                           |
| ----------------------------------- | ----------------------------------------------------------------------------------------------- |
| `DATABASE_ADMIN_URL`                | Your Postgres superuser connection, e.g. `postgres://postgres:postgres@localhost:5433/postgres` |
| `DATABASE_URL`, `DATABASE_URL_TEST` | Pick a password for the `kaamico` app role; `db:create` creates the role with it                |
| `SEED_ADMIN_PASSWORD`               | Password for the seeded admin (random and printed by `db:seed` if left empty)                   |
| `RATE_LIMIT_MULTIPLIER`             | `20` in development, so repeated test sign-ins aren't rate-limited                              |

<http://localhost:3000/api/health> returns `200` once the database is connected.

### Demo accounts

`npm run db:reset` loads a deterministic demo set:

- 2 cities (Pune and Bengaluru) with 32 localities.
- 10 categories and 38 services.
- 140 professionals and 6 customers.
- About 480 bookings in every state.

| Who                         | Sign in with                            | What you'll see                                                    |
| --------------------------- | --------------------------------------- | ------------------------------------------------------------------ |
| Customer (Priya, Pune)      | `+91 90000 00001` at `/login`           | An upcoming confirmed booking, and a request waiting for Rakesh    |
| Customer (Aditya, Pune)     | `+91 90000 00002` at `/login`           | A negotiation waiting for his reply                                |
| Professional (Rakesh Patil) | `+91 90000 00101` at `/login`           | Verified and online, with a new request and a counteroffer pending |
| Admin                       | `admin@kaamico.local` at `/admin/login` | Password: your `SEED_ADMIN_PASSWORD`                               |

In development the 6-digit sign-in code is shown on screen, and no SMS is sent. For a guided 10-minute tour of all three journeys, see the **[demo guide](docs/demo-guide.md)**.

> [!NOTE]
> Some parts are simulated, and say so on screen: phone OTP, online payments (unless Razorpay test mode is on), payouts and arrival times (straight-line estimates). Receipts are booking receipts, not GST tax invoices.

## Testing

```bash
npm run check            # lint, typecheck, format check, unit and integration tests
npm run test:e2e:build   # Playwright against a production build (what CI runs)
```

- **Unit and integration tests (Vitest):** run against a real Postgres test database rebuilt from migrations on every run. They cover booking state transitions, the negotiation rules, ledger arithmetic, concurrency races and every database integrity trigger.
- **End-to-end tests (Playwright):** cover sign-in, discovery, booking and negotiation, quick match, the professional's job flow, reviews, disputes, admin, live updates, keyboard-only use, dark mode and the offline page. Every main route also gets an axe scan at phone and desktop sizes.

## Project structure

```
src/
  app/          Routes, layouts and API route handlers (/api/v1/*)
  components/   ui/ primitives · patterns/ page patterns · domain/ Kaamico concepts · layout/ shells
  modules/      Domain logic: auth, catalog, matching, bookings, negotiation, ledger, payments, …
  db/           Drizzle schema, SQL migrations, seed data and integrity tests
  i18n/         English and Hindi messages
  styles/       Design tokens (colour, type, radii, motion)
e2e/            Playwright tests
docs/           Architecture notes, demo guide, runbook and screenshots
```

<details>
<summary><strong>All npm scripts</strong></summary>

| Command                                  | What it does                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| `npm run dev`                            | Development server                                                        |
| `npm run build` / `npm start`            | Production build / serve it                                               |
| `npm run lint` · `typecheck` · `format`  | ESLint · `tsc --noEmit` · Prettier                                        |
| `npm test`                               | Unit and integration tests (Vitest)                                       |
| `npm run test:e2e`                       | Browser tests (run `npx playwright install chromium` once)                |
| `npm run test:e2e:build`                 | Browser tests against a production build                                  |
| `npm run test:smoke`                     | Smoke checks; with `E2E_BASE_URL` they run against a deployment           |
| `npm run db:create`                      | Create the app role, databases and extensions                             |
| `npm run db:generate` · `db:migrate`     | Generate a migration from schema changes · apply migrations               |
| `npm run db:seed` · `db:reset`           | Load the demo data · drop, migrate and seed                               |
| `npm run db:studio`                      | Browse the database in Drizzle Studio                                     |
| `npm run db:backup` · `db:restore-drill` | Back up · restore the newest backup into a scratch database and verify it |
| `npm run sweep`                          | Expire requests, deliver notifications, purge old ID files                |
| `npm run check`                          | Lint, typecheck, format check and tests                                   |

</details>

## Documentation

- **[Architecture and engineering notes](docs/architecture.md):** matching, negotiation, bookings, payments, ledger, disputes, auth, live updates, security and conventions.
- **[Demo guide](docs/demo-guide.md):** a 10-minute walkthrough of the customer, professional and admin journeys.
- **[Runbook](docs/runbook.md):** environments, deploys, rollback, backups and incidents.
- **[Implementation plan](IMPLEMENTATION_PLAN.md):** the product and technical plan the app was built from.
