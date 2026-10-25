import { timingSafeEqual } from 'node:crypto'
import { getEnv } from '@/config/env'
import { forbidden } from '@/lib/errors'
import { route } from '@/lib/http'
import { expireDue } from '@/modules/bookings/repo'

function authorised(request: Request): boolean {
  const secret = getEnv().CRON_SECRET
  const given = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!secret) return false
  const a = Buffer.from(given)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Expires lapsed offers and requests (run every minute by a scheduler, or
 * `npm run sweep`). Correctness never depends on it: reads and writes expire lazily.
 */
export const POST = route(
  async (request) => {
    if (!authorised(request)) throw forbidden('Invalid cron secret')
    const expired = await expireDue(new Date())
    return Response.json({ expired }, { headers: { 'cache-control': 'no-store' } })
  },
  // Called server-to-server with a bearer secret, not from a browser.
  { csrf: false },
)
