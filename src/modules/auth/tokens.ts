import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'

/** 256-bit random session token for the cookie. */
export const generateSessionToken = () => randomBytes(32).toString('base64url')

export const sha256Hex = (value: string) => createHash('sha256').update(value).digest('hex')

/** Six-digit one-time code, uniformly random. */
export const generateOtp = () => String(randomInt(0, 1_000_000)).padStart(6, '0')

/** Keyed hash of an OTP bound to its phone number, so stored hashes cannot be brute-forced offline. */
export const hashOtp = (phone: string, code: string, secret: string) =>
  createHmac('sha256', secret).update(`${phone}:${code}`).digest('hex')

/** Constant-time comparison of two hex digests. */
export function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex')
  const right = Buffer.from(b, 'hex')
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right)
}
