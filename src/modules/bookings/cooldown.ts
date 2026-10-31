import 'server-only'
import { sql } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { negotiationConfig } from '@/modules/negotiation/config'

const { count: THRESHOLD, windowDays } = negotiationConfig.limits.unansweredExpired

/**
 * How many of the customer's recent requests expired while a professional's quote was
 * waiting for them (§11.2 abuse prevention). From three in seven days the booking screens
 * ask them to send only requests they will follow up; nothing is blocked.
 */
export async function unansweredExpiredCount(customerId: string, now = new Date()) {
  const since = new Date(now.getTime() - windowDays * 86_400_000).toISOString()
  const [row] = await getDb().execute<{ n: number }>(sql`
    select count(*)::int as n from bookings b
    where b.customer_id = ${customerId} and b.status = 'EXPIRED'
      and b.created_at >= ${since}::timestamptz
      and exists (
        select 1 from price_offers o
        where o.booking_id = b.id and o.offered_by = 'WORKER' and o.status = 'EXPIRED'
      )`)
  return row?.n ?? 0
}

export async function needsCooldownPrompt(customerId: string, now = new Date()) {
  return (await unansweredExpiredCount(customerId, now)) >= THRESHOLD
}
