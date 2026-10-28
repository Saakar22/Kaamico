import 'server-only'
import postgres from 'postgres'
import { z } from 'zod'
import { getEnv } from '@/config/env'
import { logger } from '@/lib/logger'

/**
 * Live updates (IMPLEMENTATION_PLAN.md §13, SSE). Database triggers announce changes on
 * the `kmc_events` channel (migration 0005) with the user ids they concern. Each server
 * process keeps one LISTEN connection and passes events to that user's open streams.
 * Events carry ids only; the browser re-reads anything it shows through the normal,
 * authorised pages and APIs.
 */

export const CHANNEL = 'kmc_events'

const eventSchema = z.object({
  type: z.enum(['booking', 'notification']),
  bookingId: z.uuid().optional(),
  users: z.array(z.uuid()),
})

export type LiveEvent = { type: 'booking' | 'notification'; bookingId?: string }
type Listener = (event: LiveEvent) => void

const subscribers = new Map<string, Set<Listener>>()
let listening: Promise<boolean> | null = null

/** Delivers one raw NOTIFY payload to the subscribed users it names. */
export function deliver(payload: string): number {
  let parsed: z.infer<typeof eventSchema>
  try {
    parsed = eventSchema.parse(JSON.parse(payload))
  } catch {
    logger.warn({ payload: payload.slice(0, 200) }, 'ignored malformed live event')
    return 0
  }
  const event: LiveEvent = { type: parsed.type, bookingId: parsed.bookingId }
  let delivered = 0
  for (const userId of parsed.users) {
    for (const listener of subscribers.get(userId) ?? []) {
      listener(event)
      delivered++
    }
  }
  return delivered
}

/** Starts (once) and waits for the LISTEN connection; resolves false if it failed. */
function ensureListening(): Promise<boolean> {
  listening ??= postgres(getEnv().DATABASE_URL, { max: 1, onnotice: () => {} })
    .listen(CHANNEL, deliver)
    .then(() => true)
    .catch((error) => {
      // Streams stay open and the browser keeps polling; try again on the next subscriber.
      logger.error({ err: error }, 'live updates: LISTEN failed')
      listening = null
      return false
    })
  return listening
}

/** Adds `listener` for `userId`'s events without opening the LISTEN connection (tests). */
export function subscribeLocal(userId: string, listener: Listener): () => void {
  let set = subscribers.get(userId)
  if (!set) subscribers.set(userId, (set = new Set()))
  set.add(listener)
  const mine = set
  let done = false
  // Safe to call more than once, and never touches a newer stream's listeners.
  return () => {
    if (done) return
    done = true
    mine.delete(listener)
    if (mine.size === 0 && subscribers.get(userId) === mine) subscribers.delete(userId)
  }
}

/**
 * Subscribes `listener` to events for `userId` once the LISTEN connection is up, so
 * nothing committed after the stream says "ready" is missed. Null when LISTEN is not
 * available: the caller must not claim to be live (the browser keeps polling).
 */
export async function subscribe(userId: string, listener: Listener): Promise<(() => void) | null> {
  if (!(await ensureListening())) return null
  return subscribeLocal(userId, listener)
}
