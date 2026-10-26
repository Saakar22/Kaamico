import { timingSafeEqual } from 'node:crypto'
import { getEnv } from '@/config/env'
import { forbidden } from '@/lib/errors'
import { route } from '@/lib/http'
import { purgeDueDocuments } from '@/modules/admin/verifications'
import { expireDue } from '@/modules/bookings/repo'
import { dispatchOutbox } from '@/modules/notifications/dispatcher'

function authorised(request: Request): boolean {
  const secret = getEnv().CRON_SECRET
  const given = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!secret) return false
  const a = Buffer.from(given)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Expires lapsed offers and requests, delivers queued notifications and deletes identity
 * files past their retention date (run every minute by a scheduler, or `npm run sweep`).
 * Correctness never depends on it: reads and writes expire lazily, and reading
 * notifications delivers pending ones.
 */
export const POST = route(
  async (request) => {
    if (!authorised(request)) throw forbidden('Invalid cron secret')
    const now = new Date()
    const expired = await expireDue(now)
    const dispatched = await dispatchOutbox({ now, limit: 200 })
    const documents = await purgeDueDocuments(now)
    return Response.json(
      { expired, dispatched, documents },
      { headers: { 'cache-control': 'no-store' } },
    )
  },
  // Called server-to-server with a bearer secret, not from a browser.
  { csrf: false },
)
