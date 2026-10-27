import 'server-only'
import { sql } from 'drizzle-orm'
import { getEnv } from '@/config/env'
import { getDb } from '@/db/client'
import { AppError } from './errors'
import { clientIp } from './request'

export type RateLimitRule = { limit: number; windowSeconds: number }

type Counter = { count: number; retryAfterSeconds: number }

function effectiveLimit(rule: RateLimitRule): number {
  return rule.limit * getEnv().RATE_LIMIT_MULTIPLIER
}

/** Counts one hit in a fixed window (stored in Postgres, so it works across instances). */
export async function hitRateLimit(bucket: string, rule: RateLimitRule): Promise<Counter> {
  const rows = await getDb().execute<{ count: number; retry_after: number }>(sql`
    insert into rate_limits (bucket, window_start, count) values (${bucket}, now(), 1)
    on conflict (bucket) do update set
      count = case when rate_limits.window_start <= now() - make_interval(secs => ${rule.windowSeconds})
                   then 1 else rate_limits.count + 1 end,
      window_start = case when rate_limits.window_start <= now() - make_interval(secs => ${rule.windowSeconds})
                   then now() else rate_limits.window_start end
    returning count,
      ceil(extract(epoch from (window_start + make_interval(secs => ${rule.windowSeconds}) - now())))::int as retry_after`)
  return { count: rows[0].count, retryAfterSeconds: Math.max(1, rows[0].retry_after) }
}

/** Reads a counter without incrementing it. */
export async function peekRateLimit(bucket: string, rule: RateLimitRule): Promise<Counter> {
  const rows = await getDb().execute<{ count: number; retry_after: number }>(sql`
    select count,
      ceil(extract(epoch from (window_start + make_interval(secs => ${rule.windowSeconds}) - now())))::int as retry_after
    from rate_limits
    where bucket = ${bucket} and window_start > now() - make_interval(secs => ${rule.windowSeconds})`)
  return rows[0]
    ? { count: rows[0].count, retryAfterSeconds: Math.max(1, rows[0].retry_after) }
    : { count: 0, retryAfterSeconds: 0 }
}

export async function resetRateLimit(bucket: string): Promise<void> {
  await getDb().execute(sql`delete from rate_limits where bucket = ${bucket}`)
}

function tooMany(message: string, retryAfterSeconds: number): AppError {
  return new AppError('RATE_LIMITED', message, { details: { retryAfterSeconds } })
}

/** Counts a hit and throws 429 once the limit is exceeded. */
export async function enforceRateLimit(bucket: string, rule: RateLimitRule, message: string) {
  const counter = await hitRateLimit(bucket, rule)
  if (counter.count > effectiveLimit(rule)) throw tooMany(message, counter.retryAfterSeconds)
}

/** Throws 429 if a failure counter (incremented separately) is already at its limit. */
export async function assertBelowLimit(bucket: string, rule: RateLimitRule, message: string) {
  const counter = await peekRateLimit(bucket, rule)
  if (counter.count >= effectiveLimit(rule)) throw tooMany(message, counter.retryAfterSeconds)
}

/**
 * Public search runs the heaviest queries and needs no sign-in, so it is capped per IP
 * (generous for typing and paging; it stops scraping and floods). No IP, no limit.
 */
export async function limitSearches(request: Request) {
  const ip = clientIp(request)
  if (!ip) return
  await enforceRateLimit(
    `search:ip:${ip}`,
    { limit: 120, windowSeconds: 60 },
    'Too many searches. Please wait a minute.',
  )
}
