import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { authSecret } from '@/lib/secrets'

/** Signed links expire quickly: long enough to open a document, not to share it. */
export const SIGNED_URL_TTL_SECONDS = 5 * 60

const payloadSchema = z.object({
  /** Storage key. */
  k: z.string().min(1).max(200),
  /** MIME type to serve with. */
  t: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  /** Expiry, seconds since the epoch. */
  e: z.number().int().positive(),
})

export type SignedFile = { key: string; mimeType: z.infer<typeof payloadSchema>['t']; expiresAt: Date }

const sign = (data: string) =>
  createHmac('sha256', `file-url:${authSecret()}`).update(data).digest('base64url')

/** A token for `/api/v1/files/[token]`, valid for `ttlSeconds`. */
export function createFileToken(
  file: { key: string; mimeType: string },
  now: Date = new Date(),
  ttlSeconds = SIGNED_URL_TTL_SECONDS,
): { token: string; expiresAt: Date } {
  const e = Math.floor(now.getTime() / 1000) + ttlSeconds
  const payload = payloadSchema.parse({ k: file.key, t: file.mimeType, e })
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return { token: `${data}.${sign(data)}`, expiresAt: new Date(e * 1000) }
}

/** Returns the file a token grants, or null if it is forged, malformed or expired. */
export function verifyFileToken(token: string, now: Date = new Date()): SignedFile | null {
  const [data, signature, extra] = token.split('.')
  if (!data || !signature || extra !== undefined || token.length > 1000) return null
  const expected = Buffer.from(sign(data))
  const given = Buffer.from(signature)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  try {
    const payload = payloadSchema.parse(JSON.parse(Buffer.from(data, 'base64url').toString()))
    if (payload.e * 1000 <= now.getTime()) return null
    return { key: payload.k, mimeType: payload.t, expiresAt: new Date(payload.e * 1000) }
  } catch {
    return null
  }
}
