import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

// Plain node:crypto only, so the seed script can use it too.

/**
 * The 4-digit code the customer gives the professional on arrival. It is derived from
 * the booking id and the server secret, so it can be shown to the customer again
 * without being stored; only its hash is kept on the booking.
 */
export function deriveStartCode(bookingId: string, secret: string): string {
  const mac = createHmac('sha256', `start-code:${secret}`).update(bookingId).digest()
  return String(mac.readUInt32BE(0) % 10_000).padStart(4, '0')
}

export function hashStartCode(bookingId: string, code: string): string {
  return createHash('sha256').update(`${bookingId}:${code}`).digest('hex')
}

/** Constant-time check of an entered code against the stored hash. */
export function startCodeMatches(bookingId: string, entered: string, storedHash: string): boolean {
  if (!/^\d{4}$/.test(entered)) return false
  const a = Buffer.from(hashStartCode(bookingId, entered), 'hex')
  const b = Buffer.from(storedHash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Wrong codes allowed before the job is locked (support must help). */
export const MAX_START_CODE_ATTEMPTS = 5
