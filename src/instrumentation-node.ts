import { getEnv } from '@/config/env'
import { logger } from '@/lib/logger'
import { scrubEvent } from '@/lib/sentry-scrub'

type Sentry = typeof import('@sentry/nextjs')
let sentry: Sentry | null = null

/** Server error reporting, only when SENTRY_DSN is set (loaded on demand). */
export async function startErrorReporting() {
  const env = getEnv()
  if (!env.SENTRY_DSN) return
  sentry = await import('@sentry/nextjs')
  sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
    // Collect no personal data at all; scrubEvent is a second line of defence.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    tracesSampleRate: 0,
    beforeSend: (event) => scrubEvent(event),
  })
}

/**
 * Boot guard: validates the environment once when the server starts. A production server
 * with simulated OTP/payments, a missing secret or a loose rate limit exits instead of
 * serving (Next.js alone would stay up and answer every request with a 500). Development
 * keeps running and shows the error. `next build` skips the runtime rules.
 */
export function checkEnvironment() {
  try {
    getEnv()
  } catch (error) {
    const building = process.env.NEXT_PHASE === 'phase-production-build'
    if (process.env.NODE_ENV !== 'production' || building) throw error
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

/** One structured log line per unhandled server error, with the digest users see. */
export function logRequestError(
  error: unknown,
  request: Parameters<Sentry['captureRequestError']>[1],
  context: Parameters<Sentry['captureRequestError']>[2],
) {
  const digest =
    typeof error === 'object' && error !== null && 'digest' in error
      ? String(error.digest)
      : undefined
  logger.error(
    {
      err: error,
      digest,
      method: request.method,
      path: request.path,
      route: context.routePath,
      routeType: context.routeType,
    },
    'unhandled request error',
  )
  sentry?.captureRequestError(error, request, context)
}
