import { getEnv } from '@/config/env'
import { logger } from '@/lib/logger'

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
  request: { method: string; path: string },
  context: { routePath: string; routeType: string },
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
}
