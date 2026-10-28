import { AppError } from './errors'

const IP = /^[0-9a-fA-F:.]{2,45}$/

/**
 * The client's IP for rate limits and audit rows. Each proxy appends the address it saw
 * to X-Forwarded-For, so only the entries added by our own proxies can be trusted: with
 * `hops` proxies in front of the app, the client is the `hops`-th entry from the right.
 * Anything further left was sent by the client and could be made up. With no proxy
 * (`hops` = 0) the header is ignored.
 */
export function clientIp(
  request: Request,
  hops: number = Number(process.env.TRUSTED_PROXY_HOPS ?? 1),
): string | null {
  if (!Number.isInteger(hops) || hops < 1) return null
  const chain = (request.headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  const ip =
    chain.length > 0 ? chain[chain.length - hops] : request.headers.get('x-real-ip')?.trim()
  return ip && IP.test(ip) ? ip : null
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
