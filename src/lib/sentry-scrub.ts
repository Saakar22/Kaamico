/**
 * Strips personal data from error reports before they leave the app (§13: "Scrub PII
 * (phone, address)"). Used by the server and browser Sentry setups. Kaamico's own ids
 * (UUIDs, booking codes) are kept: they are what support needs and identify nobody.
 */

const PHONE = /(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g
const UPI = /\b[\w.-]{2,}@(?:ok\w+|ybl|ibl|axl|paytm|upi|apl)\b/gi

export function scrubText(text: string): string {
  return text.replace(UPI, '[upi]').replace(EMAIL, '[email]').replace(PHONE, '[phone]')
}

type Frame = { vars?: unknown }
type Exception = { value?: string; stacktrace?: { frames?: Frame[] } }
type Breadcrumb = { message?: string; data?: unknown }

/** The parts of a Sentry event this touches (kept structural to avoid an SDK import). */
export type ScrubbableEvent = {
  message?: string
  user?: unknown
  request?: {
    cookies?: unknown
    headers?: Record<string, string>
    data?: unknown
    query_string?: unknown
  }
  exception?: { values?: Exception[] }
  breadcrumbs?: Breadcrumb[]
  extra?: unknown
}

const DROP_HEADERS = ['cookie', 'authorization', 'x-razorpay-signature', 'x-forwarded-for']

export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  delete event.user
  delete event.extra
  if (event.message) event.message = scrubText(event.message)
  if (event.request) {
    delete event.request.cookies
    delete event.request.data
    delete event.request.query_string
    if (event.request.headers) {
      for (const name of Object.keys(event.request.headers)) {
        if (DROP_HEADERS.includes(name.toLowerCase())) delete event.request.headers[name]
      }
    }
  }
  for (const ex of event.exception?.values ?? []) {
    if (ex.value) ex.value = scrubText(ex.value)
    for (const frame of ex.stacktrace?.frames ?? []) delete frame.vars
  }
  for (const crumb of event.breadcrumbs ?? []) {
    if (crumb.message) crumb.message = scrubText(crumb.message)
    delete crumb.data
  }
  return event
}
