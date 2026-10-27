# syntax=docker/dockerfile:1.7
# Kaamico production image. See docs/runbook.md.
#
#   docker build --secret id=database_url,env=BUILD_DATABASE_URL -t kaamico .
#
# The build prerenders catalog pages from the database, so BUILD_DATABASE_URL must point
# at the database this image will serve (the target environment's). It is passed as a
# BuildKit secret and never stored in a layer.

ARG NODE_IMAGE=node:24.22.1-bookworm-slim

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json .npmrc ./
RUN npm ci --ignore-scripts

# Full sources and dependencies: builds the app, and runs migrations and seeds
# (`docker run --rm kaamico:tools node scripts/db-migrate.mjs`).
FROM deps AS tools
COPY . .

FROM tools AS builder
ARG NEXT_PUBLIC_SENTRY_DSN=""
ARG NEXT_PUBLIC_SENTRY_ENVIRONMENT=""
ENV BUILD_STANDALONE=1 \
    NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN} \
    NEXT_PUBLIC_SENTRY_ENVIRONMENT=${NEXT_PUBLIC_SENTRY_ENVIRONMENT}
RUN --mount=type=secret,id=database_url,required=true \
    DATABASE_URL="$(cat /run/secrets/database_url)" npm run build

# Only the self-contained server: no sources, no dev dependencies, not root.
FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN useradd --system --uid 1001 kaamico
COPY --from=builder --chown=kaamico /app/.next/standalone ./
COPY --from=builder --chown=kaamico /app/.next/static ./.next/static
USER kaamico
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
