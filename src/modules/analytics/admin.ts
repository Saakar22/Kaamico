import 'server-only'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db/client'
import { istDateKey } from '@/lib/time'

export const ANALYTICS_RANGES = ['7', '30', '90'] as const
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number]

export const adminAnalyticsQuery = z.object({
  days: z.enum(ANALYTICS_RANGES).default('30'),
})

export type FunnelStep = { key: string; label: string; count: number }

export type NegotiationOutcome = {
  key: 'LISTED' | 'NEGOTIATED' | 'DECLINED' | 'EXPIRED' | 'CANCELLED' | 'OPEN'
  label: string
  count: number
}

export type LocalitySupply = {
  localityId: string
  name: string
  city: string
  /** Verified professionals based here. */
  professionals: number
  onlineNow: number
  requests: number
  /** Requests that expired or were declined without a booking. */
  unfilled: number
}

export type AdminAnalytics = {
  days: number
  from: string
  funnel: FunnelStep[]
  emptySearches: number
  outcomes: NegotiationOutcome[]
  /** Median agreed price as a share of the listed price, for negotiated bookings (e.g. 0.92). */
  medianAgreedShare: number | null
  quickMatches: number
  localities: LocalitySupply[]
}

const OUTCOME_LABEL: Record<NegotiationOutcome['key'], string> = {
  LISTED: 'Booked at the listed price',
  NEGOTIATED: 'Booked after negotiating',
  DECLINED: 'Declined by the professional',
  EXPIRED: 'Expired without an answer',
  CANCELLED: 'Cancelled by the customer before booking',
  OPEN: 'Still being discussed',
}

/** "Available now" uses the same 15-minute presence window as search. */
const ONLINE_WINDOW = sql`interval '15 minutes'`

/**
 * Funnels, negotiation outcomes and supply by locality for `/admin/analytics` (§5, P1).
 * Everything is counted over bookings created in the last `days` days (IST calendar
 * days, today included), so each step of the funnel is a subset of the one before.
 */
export async function getAdminAnalytics(
  raw: unknown,
  now: Date = new Date(),
): Promise<AdminAnalytics> {
  const { days: daysText } = adminAnalyticsQuery.parse(raw)
  const days = Number(daysText)
  const fromDay = istDateKey(new Date(now.getTime() - (days - 1) * 86_400_000))
  const from = sql`(${fromDay}::date::timestamp at time zone 'Asia/Kolkata')`
  const db = getDb()

  const [[funnel], outcomes, localities] = await Promise.all([
    db.execute<{
      searches: number
      empty: number
      requests: number
      confirmed: number
      completed: number
      quick: number
      median_share: number | null
    }>(sql`
      with b as (select * from bookings where created_at >= ${from})
      select
        (select coalesce(sum(searches), 0)::int from search_daily_counts where day >= ${fromDay}::date) as searches,
        (select coalesce(sum(empty_results), 0)::int from search_daily_counts where day >= ${fromDay}::date) as empty,
        (select count(*)::int from b) as requests,
        (select count(*)::int from b where confirmed_at is not null) as confirmed,
        (select count(*)::int from b where status = 'COMPLETED') as completed,
        (select count(*)::int from b where mode = 'BROADCAST') as quick,
        (select percentile_cont(0.5) within group (order by agreed_price_paise::float8 / listed_price_paise)
           from b where confirmed_at is not null and listed_price_paise > 0
             and agreed_price_paise <> listed_price_paise) as median_share`),
    db.execute<{ outcome: NegotiationOutcome['key']; n: number }>(sql`
      select outcome, count(*)::int as n from (
        select case
          when confirmed_at is not null and agreed_price_paise = listed_price_paise then 'LISTED'
          when confirmed_at is not null then 'NEGOTIATED'
          when status = 'EXPIRED' then 'EXPIRED'
          when status = 'CANCELLED' and cancelled_by = 'SYSTEM' then 'DECLINED'
          when status = 'CANCELLED' then 'CANCELLED'
          else 'OPEN'
        end as outcome
        from bookings where created_at >= ${from}
      ) o group by outcome`),
    db.execute<{
      id: string
      name: string
      city: string
      professionals: number
      online_now: number
      requests: number
      unfilled: number
    }>(sql`
      select l.id, l.name, l.city,
        coalesce(w.professionals, 0)::int as professionals,
        coalesce(w.online_now, 0)::int as online_now,
        coalesce(d.requests, 0)::int as requests,
        coalesce(d.unfilled, 0)::int as unfilled
      from localities l
      left join (
        select base_locality_id,
          count(*) as professionals,
          count(*) filter (where is_online and last_active_at > now() - ${ONLINE_WINDOW}) as online_now
        from worker_profiles where verification_status = 'VERIFIED'
        group by base_locality_id
      ) w on w.base_locality_id = l.id
      left join (
        select a.locality_id,
          count(*) as requests,
          count(*) filter (where b.confirmed_at is null and (b.status = 'EXPIRED'
            or (b.status = 'CANCELLED' and b.cancelled_by = 'SYSTEM'))) as unfilled
        from bookings b join addresses a on a.id = b.address_id
        where b.created_at >= ${from}
        group by a.locality_id
      ) d on d.locality_id = l.id
      where l.is_serviceable and (w.professionals > 0 or d.requests > 0)
      order by coalesce(d.requests, 0) desc, coalesce(w.professionals, 0) desc, l.city, l.name
      limit 20`),
  ])

  const byOutcome = new Map(outcomes.map((o) => [o.outcome, o.n]))
  return {
    days,
    from: fromDay,
    funnel: [
      { key: 'searches', label: 'Searches', count: funnel.searches },
      { key: 'requests', label: 'Requests sent', count: funnel.requests },
      { key: 'confirmed', label: 'Booked', count: funnel.confirmed },
      { key: 'completed', label: 'Completed', count: funnel.completed },
    ],
    emptySearches: funnel.empty,
    outcomes: (Object.keys(OUTCOME_LABEL) as NegotiationOutcome['key'][]).map((key) => ({
      key,
      label: OUTCOME_LABEL[key],
      count: byOutcome.get(key) ?? 0,
    })),
    medianAgreedShare: funnel.median_share === null ? null : Number(funnel.median_share),
    quickMatches: funnel.quick,
    localities: localities.map((l) => ({
      localityId: l.id,
      name: l.name,
      city: l.city,
      professionals: l.professionals,
      onlineNow: l.online_now,
      requests: l.requests,
      unfilled: l.unfilled,
    })),
  }
}
