import { scrubEvent } from './sentry-scrub'

/**
 * Browser error reporting (Sentry), on only when NEXT_PUBLIC_SENTRY_DSN is set at build
 * time. The SDK is loaded on demand, so pages without it carry no extra script.
 */

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN

let started: Promise<typeof import('@sentry/nextjs') | null> | null = null

function sentry() {
  if (!DSN) return Promise.resolve(null)
  started ??= import('@sentry/nextjs').then((Sentry) => {
    Sentry.init({
      dsn: DSN,
      environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
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
      beforeBreadcrumb: (crumb) => (crumb.category === 'console' ? null : crumb),
    })
    return Sentry
  })
  return started
}

/** Starts browser reporting early (uncaught errors), if configured. */
export function startClientErrorReporting() {
  void sentry()
}

/** Reports an error caught by an error boundary, if configured. */
export function reportClientError(error: unknown) {
  void sentry().then((Sentry) => Sentry?.captureException(error))
}
