# Kaamico

**Local Skills. Fair Prices.** A hyperlocal marketplace for household services in India. Professionals set their own prices, and customers can agree a fair price with them through transparent offers.

> **Status: Phase 14 (remaining P1).** P0, the P1 core and deployment readiness are complete; payout requests, analytics, SEO city pages, dark mode and the installable app are in. Customers find a professional (or send a quick match), agree a price, track the job live, approve extras, pay in cash or online, get a numbered receipt, review, and can report a problem or ask for help. Professionals run each job, see every earning, fee and refund in their ledger with weekly and per-service trends, and ask for payouts. Admins handle ID verification, bookings, reported problems, refunds, payouts, reviews, support, users and the catalog, all audited, and see a funnel and supply analytics. The app ships as a container image with private S3/R2 storage, tested backups and a runbook ([docs/runbook.md](docs/runbook.md)). OTP, online payments (unless Razorpay test mode is on) and payouts are simulated. Not built yet: a map pin picker (needs map keys). See [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for the plan and the [demo guide](#demo-guide) for a 10-minute walkthrough.

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

## Demo guide

A walkthrough of the three journeys on freshly seeded data (`npm run db:reset`, then restart `npm run dev`). Use two browser windows, one of them private, so the customer and the professional can be signed in at once. Every code is shown on screen; nothing is sent.

**1. Customer: find and book (≈ 4 min).** Sign in at `/login` as Priya (`90000 00001`). The dashboard already shows an upcoming confirmed booking and a request waiting for Rakesh. Search "plumber" from the home page: cards show the distance, an arrival _estimate_, the price and the rating. Sort by price, open a profile, choose **Request booking**, add an address in Kothrud, pick a time, and choose **Suggest a different price** below the listed one.

**2. Professional: answer and do the job (≈ 3 min).** In the other window sign in as Rakesh (`90000 00101`). The dashboard lists Priya's tap-repair request and Aditya's fan installation, where Aditya owes a reply. Open a request and counter it; back as the customer, accept the counter on `/bookings/:id/negotiate`. The booking shows **Price locked** and a 4-digit start code. As Rakesh, open the job under **Bookings** and tap **I'm on my way**, then **I've arrived**, enter the start code, optionally add an extra charge (the customer must approve it), then **Mark job complete**.

**3. Pay and review (≈ 1 min).** As the customer, pay with the simulated checkout (marked "Simulated"), open the receipt, and leave a review. As Rakesh, `/worker/earnings` shows the job's gross, Kaamico's 10% fee and the net.

**4. Admin (≈ 2 min).** Sign in at `/admin/login` as `admin@kaamico.local` with `SEED_ADMIN_PASSWORD`. Open the pending application under **Verifications**: documents open through a short-lived link and each view lands in the audit log. Ask for new documents or approve; the professional gets a notification. Inspect any booking's full history under **Bookings**, suspend a user under **Users**, and see every action under **Audit log**.

What is simulated, and says so on screen: phone OTP, online payments, payouts and arrival times (straight-line distance, labelled "estimate"). Receipts are not GST tax invoices.

## Discovery

- **Location** is a cookie (`kmc_loc`) holding a seeded locality or the device location. The header chip opens a sheet to change it; points more than 15 km from every serviceable locality are "not yet in your area".
- **Matching** (`src/modules/matching`) follows IMPLEMENTATION_PLAN.md §11.1: one SQL query filters verified, active, unpaused professionals with the skill and an active price, inside a bounding box and then a straight-line (haversine) distance within both the search radius and the professional's own travel radius. The radius widens 3 → 5 → 8 → 12 km until 5 are found. Ranking blends distance, Bayesian rating, reliability, price fit and a boost for new professionals, with a daily-rotating tie-break; the first page always includes a new professional when one qualifies, but never above someone closer, cheaper and better rated. Weights live in `config.ts`.
- **Availability:** "Available now" needs the professional online, active in the last 15 minutes and free for the whole job plus a 30-minute buffer. Otherwise cards show the next free start from weekly hours minus bookings and time off. Arrival times are distance-based estimates and say so.
- **Privacy:** public profiles and search results never include phone numbers, base locations or documents; unverified or suspended professionals return 404. Nearby price ranges are hidden until at least 3 professionals have set a price.
- **APIs:** `/api/v1/categories[/:slug]`, `/services/:id`, `/search?q=`, `/search/professionals`, `/localities`, `/professionals/:id[/reviews|/availability]`.
- **City pages (SEO)** (`src/modules/seo`): `/in/[city]` lists every category with local professionals, and `/in/[city]/[category]` shows what professionals there charge for each service (10th–90th percentile of their own prices), the top-rated six (Bayesian rating, as in search) and the localities they are based in. Both are prerendered for every city and category with professionals, read no cookies, refresh hourly (catalog edits refresh them at once), and carry canonical URLs plus JSON-LD (BreadcrumbList; an ItemList of Services with AggregateOffer prices). `sitemap.xml` lists the catalog, city pages and public profiles. `robots.txt` keeps accounts, consoles, the API and `/search` out, and blocks everything on a public demo (simulation allowed in production), whose professionals are seed data. Canonical URLs use `APP_URL`.
- **Caching:** the catalog and localities use `'use cache'` (minutes and hours), so `npm run build` prerenders catalog pages and needs `DATABASE_URL` to be reachable; runtime-only production rules (secrets, no simulation) are checked when the app starts, not during the build. After reseeding, restart `npm run dev` so cached pages pick up the new IDs.

## Worker supply and files

- **Setup checklist** (`/worker/onboarding` and the dashboard): profile, skills, work area, prices, hours, ID verification. Each step links to its page under `/worker/*`, and setup resumes at the first unfinished step.
- **Uploads** (`POST /api/v1/uploads`) are judged by their bytes, not their name or claimed type: JPEG, PNG and WebP up to 5 MB, and PDF up to 8 MB (ID documents only). EXIF, XMP and text metadata (including GPS) are stripped from photos, and uploads are limited to 20 an hour. Files go to `STORAGE_LOCAL_DIR` (default `./storage`, git-ignored, never under `public/`); identity documents live under their own `kyc/` prefix.
- **Identity documents** are never returned by any API: workers see metadata only, and only the last 4 characters of an ID number are stored. The only way to open a file is a 5-minute HMAC-signed link from `GET /api/v1/admin/verification-documents/:id/url` (admins only), and every link issued writes a `DOCUMENT_VIEWED` audit row.
- **Verification:** up to 6 documents; submission needs a profile, a skill, a work area, an ID document and a selfie. It is idempotent and sets the worker to PENDING with an outbox event. After a rejection, a worker can reapply after 7 days.
- **Online status:** only verified professionals can go online. While the dashboard is open it sends a heartbeat, so "available now" lapses about 15 minutes after the app closes. Pausing (today, 3 days or a week) hides a professional from new requests.
- **Retention:** approving or rejecting an application sets `purge_after` to 90 days later; the sweeper then deletes the files and keeps the metadata and decision. Asking for new documents keeps the files.

## Bookings and negotiation

- **Request** (`POST /api/v1/bookings`, idempotent): the customer picks a professional, an address, now or a free time, and either the listed price or an offer. Even "accept the listed price" is an offer the professional must accept. In one transaction the worker row is locked and eligibility, travel distance, the slot (weekly hours, bookings, time off) and the limits (3 open requests per customer, 1 per professional) are re-checked; the price, address and commission are snapshotted. A busy slot returns `409 SLOT_TAKEN` with alternative times.
- **Negotiation** (IMPLEMENTATION_PLAN.md §11.2, rules in `src/modules/negotiation`): turn-taking, at most 3 offers per side (the last is labelled "Final offer"), customers never go down and professionals never go up, a floor of max(minimum charge, 40% of the listed price), fixed prices for non-negotiable services, and a required note for quotes over 150% of the listed price. Messages mask phone numbers, UPI IDs and emails.
- **Accepting** locks the booking, then the offer, then the worker, re-checks eligibility and time off, and confirms with the agreed price, slot and start code. The database's no-overlap constraint is the final guard: with 50 parallel confirmations for one slot exactly one wins and the rest get `409 SLOT_TAKEN` (`src/modules/bookings/concurrency.int.test.ts`).
- **Expiry:** on-demand offers last 10 minutes and requests 30; scheduled offers last up to 6 hours. Lapsed offers and requests expire lazily on every read and write, and `POST /api/internal/sweep` (bearer `CRON_SECRET`; `npm run sweep`) expires the rest and delivers queued notifications.
- **Lifecycle** (`src/modules/bookings/state-machine.ts`, one table used by the API and the tests): the assigned professional moves a job EN_ROUTE (scheduled jobs: at most 90 minutes early), ARRIVED, IN_PROGRESS (with the customer's 4-digit start code; 5 wrong tries lock it) and COMPLETED (not while an extra charge awaits the customer). Extra charges count only once the customer approves them.
- **Start codes** are derived from the booking ID and `AUTH_SECRET`, so the customer can always see theirs; only a hash is stored. Changing `AUTH_SECRET` changes the codes of active bookings.
- **Cancelling:** customers cancel free until the professional sets off, then a visit fee of min(₹99, minimum charge) is recorded (collected with payments in Phase 10); no cancelling once work has started. Professionals cancel a confirmed job with a reason (it counts against reliability), or a no-show 20 minutes after arriving. Declining a request cancels it so the customer can choose someone else.
- **Privacy:** before confirmation the professional sees the customer's first name, area and distance only; the full address appears once confirmed and disappears 24 hours after completion.

## Quick match

For a job now, a customer can skip comparing and send one request (`/book/:serviceId/quick`, or "Quick match" above search results when someone is free now; `POST /api/v1/bookings` with `mode: "BROADCAST"`).

- **Who gets it:** the best-ranked professionals (the same matching as search) who are free now and travel to the address, up to five, skipping anyone this customer already has an open request with. Each gets an offer at their own listed price and a "Quick match" notification. It counts as one of the customer's three open requests.
- **First accept wins:** the professionals' accepts go through the normal acceptance path, which locks the booking row first. Exactly one confirms (`src/modules/bookings/quick-match.int.test.ts` races five at once); the others become LOST, are told "Booked by another professional", and never see the address. A professional can also counter; the customer sees everyone's status and price on the request page (refreshing every 5 seconds) and can accept a counteroffer.
- **Declining** closes only that professional's invitation; the request ends when nobody is left (or when it expires, like any on-demand request).

## Dashboards, tracking and notifications

- **Customer:** `/dashboard` puts what needs an answer first (offers, extra charges), then the job happening now, open requests and "book again". `/bookings` has Active, Upcoming, Past and Cancelled tabs (`GET /api/v1/bookings?tab=&cursor=`). `/bookings/[id]` shows the start code, a status timeline (status-based: no live location), the price with every extra charge, and a dialog to approve or decline a new charge; it refreshes every 10 seconds while the job is live and pauses when the tab is hidden.
- **Professional:** `/worker/dashboard` shows requests awaiting a reply, today's jobs and this week's completed jobs and job value. `/worker/bookings` has Today, Upcoming, Completed and Cancelled tabs; `/worker/bookings/[id]` has the address with a map link, one button for the next step, start-code entry, extra charges and the cancel / no-show options.
- **Notifications:** every booking change writes an outbox event in the same transaction. The dispatcher (`src/modules/notifications`) turns each event into in-app notifications for the other side, exactly once (failures back off 1, 2, 4… minutes and are parked after 5 tries). It runs from `POST /api/internal/sweep` and also lazily whenever someone reads their notifications, so nothing depends on a scheduler. The header bell updates live (see below) and otherwise polls `GET /api/v1/notifications/unread-count` every 30 seconds.

## Payments, earnings and reviews

- **Paying** (`POST /api/v1/bookings/:id/payments`, idempotent): once a job is completed the customer pays in cash or online. The amount is always the booking's total (agreed price + approved extras), never a number from the browser. Online payments are **simulated** in this release (`PAYMENTS_MODE=simulated`): the checkout lets you choose success or failure, and every simulated payment shows a "Simulated" badge. Cash waits for the professional to tap "I received ₹X". Choosing again replaces an unfinished attempt; a booking can only be paid once (database-enforced).
- **Ledger** (`src/modules/ledger`, append-only): capturing a payment posts, in the same transaction, `+gross` JOB_EARNING and `−fee` COMMISSION (10% by default, snapshotted per booking, rounded half up to the paisa), plus `−gross` CASH_COLLECTED for cash jobs, so a cash job leaves the professional owing the fee. The earnings page (`/worker/earnings`) is computed straight from the entries; payouts are simulated.
- **Payout requests** (`src/modules/ledger/payouts.ts`): a professional can ask for ₹100 or more of what is ready. Earnings become ready 72 hours after they are posted (the problem-report window) and are held while a report about the job is open; deductions count at once.
- **Earnings trends** (`src/modules/analytics/worker.ts`): the earnings page charts the last 8 weeks of net earnings (job value minus Kaamico's fee), earnings by service for the chosen period, and the last 30 days of requests (booked, declined, timed out or lost). Charts live in `src/components/charts`: one series in brand green, a tooltip on hover and keyboard focus, and a "Show as table" view. The amount leaves the balance immediately as a PAYOUT entry, and only one payout can be open at a time (row lock plus a partial unique index). Admins move payouts on at `/admin/payouts` (processing → paid or failed, audited); a failed payout is credited back and the professional is notified.
- **Receipts** are issued once at capture, numbered per Indian financial year (`KMC/2026-27/000123`), immutable, and printable at `/bookings/:id/receipt` for the customer, the professional and admins. The professional and admins also see Kaamico's fee. They are booking receipts, not GST tax invoices.
- **Reviews** (`/bookings/:id/review`): one per completed job, by its customer, within 14 days, with 1–5 stars, optional compliments and a comment. The professional's rating updates in the same transaction.
- **Replies and reports** (`/worker/reviews`): a professional can reply once to each review, publicly, and report a review that is unfair or about another job (the customer can report too, through the API). A reported review stays public until an admin decides.
- **Moderation** (`/admin/reviews`): reported reviews are listed oldest first. Hiding one takes it off the profile and out of the rating in the same transaction; restoring brings it back and keeping it dismisses the report. Both need a reason and are audited.
- **Saved professionals** (`/favorites`): customers save a professional from their profile and book them again from the list. Professionals who are later suspended or lose verification drop out of the list. `/profile` holds the customer's name and an optional email (the phone number is the sign-in).
- **Not yet:** collecting the visit fee when a customer cancels after the professional sets off (it is recorded on the booking history only).

## Razorpay test mode

Set `PAYMENTS_MODE=razorpay` with **test** keys (`RAZORPAY_KEY_ID=rzp_test_…`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`; the app refuses live keys and refuses to start without all three). Online payments then go through Razorpay instead of the simulated checkout, still with a "test mode" badge.

- **Paying:** the server creates a Razorpay order for the booking's total (after its transaction commits; a failure marks the attempt failed) and the browser opens Razorpay Checkout, loaded only when the customer pays. Checkout's success callback is accepted only if its signature (HMAC of order and payment id with the key secret) is valid and matches our order. Turn on automatic capture in the Razorpay dashboard.
- **Webhooks** (`POST /api/v1/webhooks/razorpay`; subscribe to `payment.captured`, `payment.failed`, `refund.processed`, `refund.failed`): the signature is checked, the event is stored once per `x-razorpay-event-id` in `payment_events` and applied in the same transaction, so retries and duplicates are harmless and a failure lets Razorpay retry. A capture for a different amount than the booking's is never applied (it is logged for a human). Whichever of the callback and the webhook arrives second changes nothing.
- **Refunds** on Razorpay payments are recorded (and counted against the cap) first, then sent to Razorpay; the webhook completes them. If Razorpay refuses a refund, at once or later, it is marked failed and its ledger entries are reversed exactly.
- Tests run against a fake Razorpay API with signed webhooks (`src/modules/payments/razorpay.int.test.ts`). Nothing in CI talks to Razorpay.

## Problems, refunds and support

- **Report a problem** (customer and professional job pages): during a job only a safety concern, and up to 72 hours after completion any problem. The booking moves to DISPUTED (no payment or review until it is settled) and the other side is told. Both sides can add notes; the description itself stays private to Kaamico.
- **Resolution** (`/admin/disputes`): in the customer's favour (refund a paid job; an unpaid one, or a full refund, cancels the booking), in the professional's favour (no refund; the job stands and can be paid), a split (partial refund), or reject (the booking goes back to where it was, including to IN_PROGRESS). The decision, any refund, its ledger entries, the booking change and the audit row are one transaction, guarded by a version check.
- **Refunds** (`/admin/payments`, or as part of a resolution) can be made in parts, never above what was paid (checked in the service and by a database trigger, so concurrent refunds cannot overshoot). Each refund posts `−refund` REFUND_CLAWBACK and `+fee returned` ADJUSTMENT, so Kaamico's fee always equals the fee on what the customer finally paid. Simulated online refunds complete at once; Razorpay refunds go through Razorpay (see above).
- **Help and support** (`/support`, `/worker/support`, `/admin/support`): a request on any topic, optionally about one booking, with a message thread. Admin replies are signed "Kaamico support" and notify the person; resolving, closing and reopening are audited. Writing again reopens a resolved request.
- **Not yet:** photo evidence on reports. Earnings from a reported job are held from payout until the report is closed.

## Admin console

Sign in at `/admin/login`. Every admin mutation writes an `admin_audit_logs` row in the same transaction as the change; the table is append-only and the API has no way to edit it.

- **Overview** (`/admin`): verifications waiting (and for how long), open requests, active jobs, today's bookings, 7-day cancellations, median first reply, suspended accounts.
- **Analytics** (`/admin/analytics`, last 7/30/90 days): the funnel from searches to requests, bookings and completed jobs; how requests ended (listed price, negotiated, declined, expired, cancelled, open) and the typical negotiated price; verified and online professionals against requests and unfilled requests per locality. Searches are counted per IST day and service in `search_daily_counts` (counts only, nothing about who searched); later result pages are not counted.
- **Payouts** (`/admin/payouts`): see Payments, earnings and reviews.
- **Verifications** (`/admin/verifications`): oldest first. The review page shows the professional, their earlier attempts and an audit trail; documents open only on request through 5-minute signed links (each view audited), with the profile photo beside the selfie. Approve, ask for new documents or reject (a reason of 10+ characters, shown to the professional). A version check stops two admins deciding at once, and the professional gets a notification.
- **Bookings** (`/admin/bookings`): filter by status, city, dates or a code, name or phone; the detail shows both parties, every offer and message, charges and history. Admins can cancel any unfinished booking with a reason both sides see.
- **Users** (`/admin/users`): search and suspend or reactivate with a reason. Suspending signs the person out everywhere, takes a professional offline and cancels their open requests; confirmed jobs are left for an admin to handle. Admin accounts cannot be changed here.
- **Categories and services** (`/admin/categories`): create, edit, hide and show (never delete). Changes expire the cached public catalog straight away.
- **Audit log** (`/admin/audit-logs`): filter by action, entity type or ID.

## Authentication

- **Customers and professionals** sign in with a phone OTP. Codes expire after 5 minutes, allow 5 attempts, and only the latest code for a number works. Only an HMAC of each code is stored. A first sign-in creates the account; the user then gives a name and chooses "book services" or "offer my services".
- **Admins** sign in at `/admin/login` with email and password (scrypt hashes). Admin powers require both the ADMIN role and a session from the admin sign-in, so a phone session never grants admin access. Admin sessions last 8 hours; other sessions last 30 days from last use.
- **Sessions** are opaque random tokens in an `HttpOnly`, `SameSite=Lax` cookie (`__Host-` prefixed over HTTPS). Only a SHA-256 of the token is stored.
- **Protection:** every mutating API checks the `Origin` header (CSRF). Rate limits are stored in Postgres: OTP requests (3 per number per 10 minutes, 10 per IP per hour), code checks, admin sign-in (10 failures per email per 15 minutes), offers, uploads, worker heartbeats and public search (120 per IP per minute).
- **Authorisation** is enforced on the server. `src/proxy.ts` only redirects visitors without a session cookie; layouts render a friendly "no access" screen; API handlers call `requireApiActor()`.

Why not an auth library? The plan's spike found that Better Auth's phone-number plugin needs a placeholder email and name for phone-only users. That would put fake data into `users`, so Kaamico uses a small amount of its own session code instead (the plan's documented fallback).

## Live updates and error reporting

- **Live updates** (`REALTIME_MODE=sse`, the default): database triggers announce committed changes to bookings, invitations, offers, messages, extra charges and notifications on a Postgres channel (`kmc_events`, migration 0005) with the user ids they concern. Each server process holds one `LISTEN` connection and streams events to that person's open pages over `GET /api/v1/events` (server-sent events; ids only, nothing private in the stream). The page then re-reads its data through the normal authorised path, and the bell updates at once. While connected, timed polling slows to a safety net; if the stream drops, the browser reconnects and polling carries on. Set `REALTIME_MODE=poll` on hosts that cut long requests.
- **Error reporting** (Sentry, optional): set `SENTRY_DSN` for server errors and `NEXT_PUBLIC_SENTRY_DSN` for browser errors. The SDK loads only when a DSN is set. No personal data is collected (user info, cookies, headers, bodies and query strings are off), and every report is scrubbed again of phone numbers, emails and UPI IDs (`src/lib/sentry-scrub.ts`). Source maps are not uploaded.

## Quality and hardening

- **Startup check:** `src/instrumentation.ts` validates the environment when the server starts. A production server with simulated OTP or payments (without `ALLOW_SIMULATION_IN_PRODUCTION=true`), a missing `AUTH_SECRET`/`CRON_SECRET` or `RATE_LIMIT_MULTIPLIER` above 1 prints the problems and exits with code 1. Unhandled server errors are logged as one JSON line with the digest users see on the error page.
- **Response headers:** every response sends `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` and a `Permissions-Policy` that allows only geolocation (for the location chip). There is no `X-Powered-By` header.
- **Page states:** the customer, public, worker and admin areas each have their own loading, error and not-found screens, so the header and navigation stay on screen when something fails.
- **Accessibility and layout:** `e2e/routes.spec.ts` opens every signed-in P0 page as a seeded customer, professional and admin. It checks each page for serious or critical axe (WCAG 2.2 AA) violations and for sideways scrolling, at 360 px on phones and 1280 px on desktop. `e2e/keyboard.spec.ts` books a job and accepts a counteroffer using only the keyboard. Public pages are covered by `e2e/a11y.spec.ts`.
- **Performance** (Lighthouse 13, mobile, production build, warm server): home 89, search 88, service page 85, sign-in 93, customer dashboard 86–89, booking detail 86, worker dashboard 86. Accessibility scored 100 and best practices 100 on every page measured. On the signed-in pages the largest paint is the greeting heading, which streams in after the session check.
- **Indexes** cover the matching query, booking lists, offers, the outbox, notifications and the verification queue. Public profiles look up each professional's approval through `verification_applications (worker_id, status)`.
- **Dark mode:** the tokens have a dark set that follows the device (`prefers-color-scheme`), unless the person picks Light or Dark under App settings on `/profile` or `/worker/profile`. The choice is kept in `localStorage` (`kmc-theme`) and applied as `<html data-theme>` by a small script in `<head>` before the first paint. Text pairs were checked at 4.5:1 or better; `e2e/theme.spec.ts` runs the axe scan in dark on public, customer, professional and admin pages.
- **Installable app (PWA):** `src/app/manifest.ts` (icons in `public/icons`, made from the logo by `node scripts/generate-icons.mjs`; `src/app/apple-icon.png` for iOS). `public/sw.js` registers in production builds only and does one thing: when a page cannot load for lack of a connection, it shows `public/offline.html`. It caches nothing else, so no personal data or stale prices stay on the device; it is served with `no-store` so updates apply on the next visit. App settings offer "Install Kaamico" where the browser allows it (Chromium), and the Add to Home Screen steps on iOS.
- **CI** also runs gitleaks over the full git history, so a committed key or password fails the build.

## Deployment

See **[docs/runbook.md](docs/runbook.md)** for environments, the first deploy, releases and rollback, the sweeper, backups and incidents. In short:

- **Image:** `Dockerfile` builds a small, non-root image of the self-contained server. The build prerenders catalog pages from the database, so it takes `DATABASE_URL` as a BuildKit secret (never stored in the image). CI builds the image and checks it boots healthy; the manual **Release** workflow migrates an environment's database and pushes the image to GitHub Container Registry.
- **Storage:** `STORAGE_DRIVER=s3` keeps files in a private S3-compatible bucket (Cloudflare R2, AWS S3 in Mumbai, or SeaweedFS/MinIO locally) with dependency-free SigV4 signing (checked against AWS's published example, and against a real S3 server when `S3_TEST_ENDPOINT` is set).
- **Staging:** `docker-compose.staging.yml` runs the image with PostgreSQL 18, S3-compatible storage and the sweeper on one machine; `E2E_BASE_URL=… npm run test:smoke` checks any deployment.
- **Demo deployments** (`ALLOW_SIMULATION_IN_PRODUCTION=true`) show a "Demo" banner on every page. `/terms` and `/privacy` are drafts awaiting legal review.

## Scripts

| Command                           | What it does                                                                     |
| --------------------------------- | -------------------------------------------------------------------------------- |
| `npm run dev`                     | Development server                                                               |
| `npm run build` / `npm start`     | Production build / serve it                                                      |
| `npm run lint`                    | ESLint                                                                           |
| `npm run typecheck`               | Generate route types, then `tsc --noEmit`                                        |
| `npm run format` / `format:check` | Prettier write / check                                                           |
| `npm test`                        | Unit and integration tests (Vitest)                                              |
| `npm run test:e2e`                | Browser tests (Playwright; run `npx playwright install chromium` once)           |
| `npm run test:e2e:build`          | Browser tests against a production build (what CI runs)                          |
| `npm run test:smoke`              | Smoke checks; with `E2E_BASE_URL` they run against a deployment                  |
| `npm run db:create`               | Create the app role, databases and extensions (idempotent)                       |
| `npm run db:generate`             | Generate a migration from schema changes                                         |
| `npm run db:migrate`              | Apply pending migrations (`-- --test` for the test database)                     |
| `npm run db:seed`                 | Replace all dev data with the demo set                                           |
| `npm run db:reset`                | Drop everything, migrate and seed (dev database)                                 |
| `npm run db:studio`               | Browse the database in Drizzle Studio                                            |
| `npm run db:backup`               | Logical backup to `backups/` (`PG_TOOLS_DOCKER=1` uses pg_dump from Docker)      |
| `npm run db:restore-drill`        | Restore the newest backup into a scratch database and verify it                  |
| `npm run sweep`                   | Expire requests, deliver notifications, purge old ID files (needs `CRON_SECRET`) |
| `npm run check`                   | Lint, typecheck, format check and tests                                          |

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
  instrumentation.ts  Startup environment check and server error logging
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
- **Styling** uses the tokens in `src/styles/tokens.css` (e.g. `bg-brand-600`, `text-ink-600`); never hard-code hex colours in components. Combine classes with `cn()`. Every token has a dark value, so a page built from tokens works in dark mode. A solid fill behind white text uses the `fill-*` tokens with `text-on-fill` (e.g. `bg-fill-brand text-on-fill`), not `bg-brand-600 text-white`, because `brand-600` turns light in dark mode; marigold carries `text-on-accent`.
- **Accessibility:** every page must pass the axe scan in `e2e/a11y.spec.ts` (WCAG 2.2 AA). Touch targets are at least 44px.
- Anything simulated (OTP, payments, payouts) must show `<SimulationBadge />`.
- `/dev/*` pages are disabled in production unless `ENABLE_UI_GALLERY=true` (set in CI only).
- **Protected pages** call `requirePageActor(role)` themselves (layout gates do not re-run on client navigations between sibling pages), sit inside their area's `loading.tsx` boundary, and export `instant = false` because they depend on the session.
- **Mutating API calls** that create things take an `Idempotency-Key` header (`withIdempotency()` in `src/lib/idempotency.ts`).

## Working on Windows

- Keep the repository **outside OneDrive** (e.g. `C:\dev\kaamico`). OneDrive locks files under `.next/` while syncing, which makes `next dev` fail with `EPERM` rename errors.
- Browser tests against `next dev` run with 2 workers, because the dev server renders slowly under heavy parallel load. `npm run test:e2e:build` tests a production build with full parallelism (as CI does).
