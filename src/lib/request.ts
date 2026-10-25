import { AppError } from './errors'

/** Best-effort client IP (first X-Forwarded-For hop set by the hosting proxy). */
export function clientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const ip = forwarded || request.headers.get('x-real-ip')?.trim()
  return ip && /^[0-9a-fA-F:.]{2,45}$/.test(ip) ? ip : null
}

export function userAgent(request: Request): string | null {
  return request.headers.get('user-agent')?.slice(0, 300) ?? null
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * CSRF defence for cookie-authenticated mutations: the browser-set Origin header
 * must match this site. (SameSite=Lax cookies are the first line of defence.)
 */
export function assertSameOrigin(request: Request, allowedOrigins: readonly string[]): void {
  if (SAFE_METHODS.has(request.method)) return
  const origin = request.headers.get('origin')
  const own = new URL(request.url).origin
  if (!origin || (origin !== own && !allowedOrigins.includes(origin))) {
    throw new AppError('FORBIDDEN', 'Cross-site request rejected', {
      details: { reason: 'origin' },
    })
  }
}

/** Parses a JSON body; malformed JSON becomes a 400 instead of a 500. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw new AppError('VALIDATION_FAILED', 'The request body must be valid JSON')
  }
}

/** The URL's query string as a plain object (first value wins), ready for a Zod schema. */
export function queryParams(request: Request): Record<string, string> {
  const params: Record<string, string> = {}
  for (const [key, value] of new URL(request.url).searchParams) params[key] ??= value
  return params
}
