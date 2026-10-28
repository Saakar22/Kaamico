import 'server-only'
import { and, desc, eq, lt, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db/client'
import { workerLedgerEntries } from '@/db/schema'
import { fromIst, toIstParts } from '@/lib/time'

export const PERIODS = ['week', 'month', 'all'] as const
export type Period = (typeof PERIODS)[number]

/** Start of the period in IST: Monday 00:00 for a week, the 1st for a month. */
export function periodStart(period: Period, now: Date): Date | null {
  if (period === 'all') return null
  const { year, month, day } = toIstParts(now)
  if (period === 'month') return fromIst(year, month, 1)
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay() // 0 = Sunday
  return fromIst(year, month, day - ((weekday + 6) % 7))
}

export type EarningsSummary = {
  period: Period
  from: string | null
  /** Job value before Kaamico's fee. */
  grossPaise: number
  commissionPaise: number
  netPaise: number
  /** Customers paid you directly in cash (already in your hands). */
  cashCollectedPaise: number
  adjustmentsPaise: number
  paidOutPaise: number
  jobs: number
  /** All time: positive means Kaamico owes you; negative means fees are due on cash jobs. */
  balancePaise: number
  simulated: true
}

/**
 * Totals straight from the append-only ledger (§10.13), so the page always equals the
 * sum of the entries shown under it.
 */
export async function earningsSummary(
  workerId: string,
  period: Period,
  now: Date = new Date(),
): Promise<EarningsSummary> {
  const from = periodStart(period, now)
  const since = from ? sql`and created_at >= ${from.toISOString()}::timestamptz` : sql``
  const [r] = await getDb().execute<{
    gross: number
    commission: number
    cash: number
    adjustments: number
    paid_out: number
    jobs: number
    balance: number
  }>(sql`
    select
      coalesce(sum(amount_paise) filter (where type = 'JOB_EARNING' ${since}), 0)::int as gross,
      coalesce(-sum(amount_paise) filter (where type = 'COMMISSION' ${since}), 0)::int as commission,
      coalesce(-sum(amount_paise) filter (where type = 'CASH_COLLECTED' ${since}), 0)::int as cash,
      coalesce(sum(amount_paise) filter (where type in ('ADJUSTMENT', 'REFUND_CLAWBACK') and payout_id is null ${since}), 0)::int as adjustments,
      -- A failed payout's amount comes back as an adjustment tied to the payout.
      coalesce(-sum(amount_paise) filter (where (type = 'PAYOUT' or payout_id is not null) ${since}), 0)::int as paid_out,
      (count(*) filter (where type = 'JOB_EARNING' ${since}))::int as jobs,
      coalesce(sum(amount_paise), 0)::int as balance
    from worker_ledger_entries where worker_id = ${workerId}`)
  return {
    period,
    from: from?.toISOString() ?? null,
    grossPaise: r.gross,
    commissionPaise: r.commission,
    netPaise: r.gross - r.commission,
    cashCollectedPaise: r.cash,
    adjustmentsPaise: r.adjustments,
    paidOutPaise: r.paid_out,
    jobs: r.jobs,
    balancePaise: r.balance,
    simulated: true,
  }
}

export type LedgerEntryView = {
  id: number
  type: string
  amountPaise: number
  description: string
  bookingId: string | null
  createdAt: string
}

const PAGE = 25

/** The professional's ledger, newest first (`cursor` = the last id seen). */
export async function listLedger(
  workerId: string,
  cursor?: string | null,
): Promise<{ entries: LedgerEntryView[]; nextCursor: string | null }> {
  const after = z.coerce.number().int().positive().safeParse(cursor)
  const rows = await getDb()
    .select()
    .from(workerLedgerEntries)
    .where(
      and(
        eq(workerLedgerEntries.workerId, workerId),
        after.success ? lt(workerLedgerEntries.id, after.data) : undefined,
      ),
    )
    .orderBy(desc(workerLedgerEntries.id))
    .limit(PAGE + 1)
  const page = rows.slice(0, PAGE)
  return {
    entries: page.map((e) => ({
      id: e.id,
      type: e.type,
      amountPaise: e.amountPaise,
      description: e.description,
      bookingId: e.bookingId,
      createdAt: e.createdAt.toISOString(),
    })),
    nextCursor: rows.length > PAGE ? String(page.at(-1)!.id) : null,
  }
}
