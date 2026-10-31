# Kaamico runbook

How to run Kaamico outside a laptop: environments, the first deploy, releases, the jobs it needs, backups and what to do when something breaks. Written for whoever operates Kaamico; the README covers development.

## What a deployment is

| Part            | What to use                                                                                                                                                                              | Notes                                                                                                                                                                 |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App             | The container image from this repo (`Dockerfile`), on any host that runs containers with long-lived HTTP requests: e.g. Render, Railway, Fly.io or a VM, in Mumbai (`ap-south-1`/`bom`). | Node 24, one process per container, health check `GET /api/health`. Live updates use server-sent events; on a host that cuts long requests, set `REALTIME_MODE=poll`. |
| Database        | Managed PostgreSQL 18 in Mumbai with point-in-time recovery (Neon, Amazon RDS, Supabase…).                                                                                               | Needs the `pgcrypto`, `btree_gist` and `citext` extensions, and `LISTEN/NOTIFY`, so use a direct (session) connection rather than a transaction-mode pooler.          |
| File storage    | A **private** S3-compatible bucket: Cloudflare R2 or AWS S3 (`ap-south-1`).                                                                                                              | No public access, no CORS: files only ever leave through the app's permission checks. Both providers encrypt at rest.                                                 |
| Scheduler       | Anything that can `POST /api/internal/sweep` with `Authorization: Bearer $CRON_SECRET` every minute.                                                                                     | Expires offers and requests, delivers queued notifications, purges ID documents 90 days after a decision.                                                             |
| Error reporting | Sentry (optional).                                                                                                                                                                       | `SENTRY_DSN` (server) and `NEXT_PUBLIC_SENTRY_DSN` (browser, build time).                                                                                             |

Simulated OTP and payments are refused in production unless `ALLOW_SIMULATION_IN_PRODUCTION=true` (a public demo), and then every page shows a "Demo" banner. A misconfigured production server exits at start-up with the list of problems.

## Settings

All settings are environment variables, validated at start-up (`src/config/env.ts`; `.env.example` lists every one). Keep them in the host's secret store or GitHub environment secrets, never in the repo.

Production needs at least: `APP_URL` (https), `DATABASE_URL`, `AUTH_SECRET` (≥ 32 random characters, e.g. `openssl rand -base64 48`), `CRON_SECRET` (≥ 32), `RATE_LIMIT_MULTIPLIER=1`, `STORAGE_DRIVER=s3` with the `S3_*` settings, and either real providers (`OTP_MODE=msg91`, `PAYMENTS_MODE=razorpay`, `EMAIL_MODE=resend`) or `ALLOW_SIMULATION_IN_PRODUCTION=true` for a demo.

**`AUTH_SECRET` is not freely rotatable:** it keys OTP hashes and derives each booking's start code. Changing it invalidates codes in flight and changes the start codes of active bookings. Rotate it only in a quiet window, and tell customers with active jobs.

## First deploy

1. **Database.** Create a PostgreSQL 18 database in Mumbai. Connect as its owner and run `create extension if not exists pgcrypto; create extension if not exists btree_gist; create extension if not exists citext;` (or run `npm run db:create` with `DATABASE_ADMIN_URL` set to an owner connection).
2. **Bucket.** Create a private R2/S3 bucket and an access key limited to it.
3. **GitHub environment.** In the repository settings, create the `staging` (and later `production`, with required reviewers) environment with the secret `DATABASE_URL` and, optionally, the variable `NEXT_PUBLIC_SENTRY_DSN`.
4. **Release.** Run the **Release** workflow for the environment. It applies migrations, builds the image against that database (the build prerenders catalog pages from it) and pushes `ghcr.io/<owner>/kaamico:<commit>` and `:<environment>`.
5. **Demo data (staging only).** `docker run --rm -e NODE_ENV=production -e DATABASE_URL=… -e SEED_ADMIN_PASSWORD=… <tools image> node src/db/seed/index.ts --force`, where the tools image is `docker build --target tools -t kaamico:tools .`. Never seed production: it replaces all data.
6. **Run the app** from the image with the settings above, port 3000, health check `/api/health`.
7. **Scheduler.** Add the once-a-minute sweep (host cron job, or a second container running the loop in `docker-compose.staging.yml`'s `sweeper` service).
8. **Check it.** `E2E_BASE_URL=https://staging.example.com npm run test:smoke`. It checks health, the demo banner, and a sign-up with a photo upload (a real storage round trip). Add `E2E_NOT_DEMO=1` for a non-demo deployment (then only run it where simulated OTP is on, i.e. not in production).

## Releases and rollback

- **Release:** run the Release workflow, then point the host at the new image tag and run the smoke checks.
- **Migrations are forward-only** and run before the new code starts, so each one must keep working with the previous release: add columns and tables; rename or drop only in a later release, after nothing reads them.
- **Rollback:** point the host back at the previous image tag. Migrations are not rolled back; the previous release keeps working because of the rule above. If a migration itself is wrong, fix forward with a new one.
- **Catalog changes** made by seeding or SQL (not through the admin console) need a new build, because catalog pages are prerendered; admin console edits refresh the cache straight away.

## Staging on one machine

`docker-compose.staging.yml` runs the image with PostgreSQL 18, S3-compatible storage (SeaweedFS) and the sweeper, so a release can be tried exactly as it will run:

```bash
docker compose -f docker-compose.staging.yml up -d db s3
docker compose -f docker-compose.staging.yml build tools
for cmd in "node scripts/db-create.mjs" "node scripts/db-migrate.mjs" \
           "node scripts/s3-create-bucket.mjs" "node src/db/seed/index.ts --force"; do
  docker compose -f docker-compose.staging.yml run --rm tools $cmd
done
BUILD_DATABASE_URL=postgres://kaamico:staging-app-password@host.docker.internal:5434/kaamico_staging \
  docker build --secret id=database_url,env=BUILD_DATABASE_URL -t kaamico:staging .
docker compose -f docker-compose.staging.yml up -d app sweeper
E2E_BASE_URL=http://localhost:3200 npm run test:smoke
```

(Git Bash on Windows: prefix `docker compose … run` with `MSYS_NO_PATHCONV=1`.) Demo logins are the seeded ones (README); the admin password is `staging-admin-login`.

## Backups and restore

- **Point-in-time recovery** from the managed database is the first line: keep at least 7 days.
- **Nightly logical backup:** `npm run db:backup` writes `backups/<db>-<time>.dump` (pg_dump custom format; `PG_TOOLS_DOCKER=1` uses pg_dump from the `postgres:18.0` image). Store dumps encrypted, outside the database provider, for 30 days. They contain personal data; treat them like the database.
- **Restore drill:** `npm run db:restore-drill` restores the newest dump into a scratch database, compares migrations and row counts of the key tables with the source, checks the integrity triggers are present, and drops the scratch database. Run it after any change to backups, and monthly.
- **Restoring for real:** restore into a new database (`pg_restore --no-owner --no-acl --dbname=<new>`), check it with the same comparisons, then switch `DATABASE_URL` and restart. Uploaded files live in the bucket and are not in the dump; enable bucket versioning to recover deleted objects.

| Drill      | Environment                             | Backup                                  | Result                                                                                                                   |
| ---------- | --------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 2026-10-28 | Local staging (Docker, PostgreSQL 18.0) | `kaamico_staging-20261027T200143Z.dump` | Passed in 3 s: 6/6 migrations, all 10 key tables equal (e.g. 484 bookings, 1,232 ledger entries), 3/3 integrity triggers |

## Monitoring

- **Uptime:** `GET /api/health` returns 200 with the database latency, or 503 when the database is down. Alert after two failures in a row.
- **Logs:** one JSON line per event (pino), each request with an `x-request-id` that also appears in API error responses and on error pages ("Reference"). Search logs by it.
- **Errors:** Sentry, when configured. Reports never carry phone numbers, emails, UPI IDs, cookies, headers or bodies.
- **Worth alerting on:** sweeps failing (`sweep` log lines or the scheduler's status), outbox events parked after 5 failures (`select count(*) from outbox_events where attempts >= 5`), `razorpay captured an unexpected amount` log lines, and a growing verification queue (admin overview).

## Incidents

| Situation                             | Do this                                                                                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| App down                              | Check `/api/health` and the host's logs. Database down → provider status. Crash at start → the log lists the invalid settings.                         |
| Bad release                           | Roll back to the previous image tag (see above).                                                                                                       |
| Leaked `CRON_SECRET`                  | Replace it in the host and scheduler; restart. Harmless otherwise (it only runs the sweep).                                                            |
| Leaked `AUTH_SECRET`                  | Replace and restart (see the rotation warning above); also delete all sessions: `delete from auth_sessions;`                                           |
| Leaked database or bucket credentials | Rotate them at the provider, update secrets, restart; review the provider's access logs.                                                               |
| Abusive user                          | Suspend them in the admin console (`/admin/users`): signs them out everywhere and cancels their open requests.                                         |
| Payment provider problem              | Customers can still pay in cash. Refunds are recorded first and undone if the provider refuses them.                                                   |
| Personal data exposed                 | Contain it, record what and whose, and follow the DPDP Act 2023 breach-notification duties (inform the Data Protection Board and the people affected). |

## Admin password reset

`/admin/login` links to `/admin/forgot-password`. An active admin's address gets a one-time link to `/admin/reset-password`, valid for 30 minutes; asking again cancels the earlier link. The form always answers the same way, so it does not reveal which addresses are admins. Using the link sets the new password (at least 12 characters), signs that admin out everywhere and writes an `admin.password_reset` audit entry. With `EMAIL_MODE=console` the email is only logged (with the link, outside production) and listed at `/dev/mailbox` in development. A real sender (Resend) still needs an account and a verified domain. Until then, a locked-out production admin needs someone with database access to store a new hash in `users.password_hash` (`hashPassword` in `src/modules/auth/password.ts` makes one). Never run the seed against production: it wipes the database.
