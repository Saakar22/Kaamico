/**
 * Application errors carry a stable machine-readable `code` and the HTTP status
 * the API layer should respond with. See IMPLEMENTATION_PLAN.md §10.0.
 */
export const ERROR_STATUS = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  STALE_VERSION: 409,
  INVALID_TRANSITION: 409,
  IDEMPOTENCY_MISMATCH: 409,
  EXPIRED: 410,
  BUSINESS_RULE: 422,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  SERVICE_UNAVAILABLE: 503,
} as const

export type ErrorCode = keyof typeof ERROR_STATUS

export class AppError extends Error {
  readonly code: string
  readonly status: number
  readonly details?: Record<string, unknown>

  constructor(
    code: ErrorCode | (string & {}),
    message: string,
    options: { status?: number; details?: Record<string, unknown>; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause })
    this.name = 'AppError'
    this.code = code
    this.status = options.status ?? ERROR_STATUS[code as ErrorCode] ?? 500
    this.details = options.details
  }
}

export const notFound = (message = 'Not found') => new AppError('NOT_FOUND', message)

export const unauthenticated = (message = 'Sign in required') =>
  new AppError('UNAUTHENTICATED', message)

export const forbidden = (message = 'You do not have access to this resource') =>
  new AppError('FORBIDDEN', message)

export const conflict = (
  code:
    'CONFLICT' | 'STALE_VERSION' | 'INVALID_TRANSITION' | 'IDEMPOTENCY_MISMATCH' | (string & {}),
  message: string,
  details?: Record<string, unknown>,
) => new AppError(code, message, { status: 409, details })

/** A domain rule was violated, e.g. `OFFER_BELOW_FLOOR`. Responds 422. */
export const businessRule = (code: string, message: string, details?: Record<string, unknown>) =>
  new AppError(code, message, { status: 422, details })

/**
 * The Postgres SQLSTATE behind a failed query (e.g. '23P01' exclusion violation),
 * whether the driver error is thrown directly or wrapped by Drizzle.
 */
export function pgErrorCode(error: unknown): string | undefined {
  for (let e = error; e && typeof e === 'object'; e = (e as { cause?: unknown }).cause) {
    const code = (e as { code?: unknown }).code
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code
  }
  return undefined
}
