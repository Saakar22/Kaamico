import 'server-only'
import { and, desc, eq, inArray, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db/client'
import { outboxEvents, payouts, workerLedgerEntries, workerProfiles } from '@/db/schema'
import { businessRule, conflict, notFound, pgErrorCode } from '@/lib/errors'
import type { Actor } from '@/modules/auth/types'
import { writeAudit, type AuditContext } from '@/modules/audit/audit'
import type { Tx } from '@/modules/bookings/repo'
import { DISPUTE_WINDOW_HOURS } from '@/modules/disputes/disputes'

/** Smallest payout a professional can ask for (§11.4). */
export const MIN_PAYOUT_PAISE = 10_000

export type PayoutAvailability = {
  balancePaise: number
  /** What can be paid out now. */
  availablePaise: number
  /** Earnings still inside the dispute window, or held by an open problem report. */
  onHoldPaise: number
  minimumPaise: number
  /** The payout waiting to be paid, if any (only one at a time). */
  openPayoutId: string | null
  simulated: true
}

/**
 * Money only becomes payable once the customer can no longer report a problem with the
 * job (72 h), and not while a report about it is open. Deductions (fees, earlier
 * payouts, refunds) always count straight away, so the available amount never exceeds
 * the balance.
 */
async function availability(db: Tx | ReturnType<typeof getDb>, workerId: string, now: Date) {
  const cutoff = new Date(now.getTime() - DISPUTE_WINDOW_HOURS * 3_600_000)
  const [r] = await db.execute<{ balance: number; available: number; open_id: string | null }>(
    sql`
    select
      coalesce(sum(e.amount_paise), 0)::int as balance,
      coalesce(sum(e.amount_paise) filter (
        where e.amount_paise < 0
           or (e.created_at <= ${cutoff.toISOString()}::timestamptz
               and not exists (select 1 from disputes d
                               where d.booking_id = e.booking_id
                                 and d.status in ('OPEN', 'UNDER_REVIEW')))
      ), 0)::int as available,
      (select p.id from payouts p
        where p.worker_id = ${workerId} and p.status in ('REQUESTED', 'PROCESSING')
        limit 1) as open_id
    from worker_ledger_entries e
    where e.worker_id = ${workerId}`,
  )
  const available = Math.max(0, r.available)
  return {
    balancePaise: r.balance,
    availablePaise: available,
    onHoldPaise: Math.max(0, r.balance - available),
    minimumPaise: MIN_PAYOUT_PAISE,
    openPayoutId: r.open_id,
    simulated: true as const,
  }
}

export function payoutAvailability(
  workerId: string,
  now: Date = new Date(),
): Promise<PayoutAvailability> {
  return availability(getDb(), workerId, now)
}

export const payoutRequestInput = z.object({
  amountPaise: z
    .number()
    .int('Enter a whole amount')
    .min(MIN_PAYOUT_PAISE, 'The smallest payout is ₹100'),
})

export type PayoutView = {
  id: string
  amountPaise: number
  status: 'REQUESTED' | 'PROCESSING' | 'PAID' | 'FAILED'
  mode: 'SIMULATED' | 'BANK' | 'UPI'
  reference: string | null
  failureReason: string | null
  requestedAt: string
  paidAt: string | null
}

const toView = (p: typeof payouts.$inferSelect): PayoutView => ({
  id: p.id,
  amountPaise: p.amountPaise,
  status: p.status,
  mode: p.mode,
  reference: p.reference,
  failureReason: p.failureReason,
  requestedAt: p.requestedAt.toISOString(),
  paidAt: p.paidAt?.toISOString() ?? null,
})

/**
 * Asks for a payout of part or all of the available balance (§10.13). The amount leaves
 * the balance at once (a PAYOUT ledger entry), so it cannot be asked for twice; if the
 * payout fails, it is credited back. Simulated: no money moves.
 */
export async function requestPayout(
  actor: Actor & { workerId: string },
  raw: unknown,
  now: Date = new Date(),
): Promise<PayoutView> {
  const input = payoutRequestInput.parse(raw)
  try {
    return await getDb().transaction(async (tx) => {
      // One request at a time per professional, so two taps cannot both pass the check.
      await tx
        .select({ id: workerProfiles.id })
        .from(workerProfiles)
        .where(eq(workerProfiles.id, actor.workerId))
        .for('update')
      const a = await availability(tx, actor.workerId, now)
      if (a.openPayoutId) {
        throw conflict('PAYOUT_IN_PROGRESS', 'Your last payout is still on its way')
      }
      if (input.amountPaise > a.availablePaise) {
        throw businessRule(
          'PAYOUT_ABOVE_AVAILABLE',
          a.availablePaise < MIN_PAYOUT_PAISE
            ? 'You need at least ₹100 ready to pay out'
            : 'That is more than is ready to pay out',
          { availablePaise: a.availablePaise },
        )
      }
      const [payout] = await tx
        .insert(payouts)
        .values({ workerId: actor.workerId, amountPaise: input.amountPaise, requestedAt: now })
        .returning()
      await tx.insert(workerLedgerEntries).values({
        workerId: actor.workerId,
        payoutId: payout.id,
        type: 'PAYOUT',
        amountPaise: -input.amountPaise,
        description: 'Payout requested (simulated)',
        createdAt: now,
      })
      return toView(payout)
    })
  } catch (error) {
    if (pgErrorCode(error) === '23505') {
      throw conflict('PAYOUT_IN_PROGRESS', 'Your last payout is still on its way')
    }
    throw error
  }
}

/** The professional's payouts, newest first. */
export async function listPayouts(workerId: string): Promise<PayoutView[]> {
  const rows = await getDb()
    .select()
    .from(payouts)
    .where(eq(payouts.workerId, workerId))
    .orderBy(desc(payouts.requestedAt))
    .limit(50)
  return rows.map(toView)
}

// --- Admin -------------------------------------------------------------------------

const NEXT: Record<PayoutView['status'], PayoutView['status'][]> = {
  REQUESTED: ['PROCESSING', 'PAID', 'FAILED'],
  PROCESSING: ['PAID', 'FAILED'],
  PAID: [],
  FAILED: [],
}

export const payoutStatusInput = z
  .object({
    status: z.enum(['PROCESSING', 'PAID', 'FAILED']),
    reason: z.string().trim().max(300).optional(),
  })
  .refine((v) => v.status !== 'FAILED' || (v.reason?.length ?? 0) >= 10, {
    path: ['reason'],
    message: 'Say why it failed (at least 10 characters)',
  })

/**
 * Moves a payout on (REQUESTED → PROCESSING → PAID / FAILED, §11.4), audited. A failed
 * payout's amount goes back to the professional's balance. The professional is told
 * when it is paid or fails.
 */
export async function setPayoutStatus(
  admin: Actor,
  payoutId: string,
  raw: unknown,
  context: AuditContext,
  now: Date = new Date(),
): Promise<PayoutView> {
  const input = payoutStatusInput.parse(raw)
  if (!z.uuid().safeParse(payoutId).success) throw notFound('Payout not found')
  return getDb().transaction(async (tx) => {
    const [before] = await tx.select().from(payouts).where(eq(payouts.id, payoutId)).for('update')
    if (!before) throw notFound('Payout not found')
    if (!NEXT[before.status].includes(input.status)) {
      throw conflict(
        'INVALID_TRANSITION',
        `This payout is already ${before.status.toLowerCase()}`,
        {
          status: before.status,
        },
      )
    }
    const [after] = await tx
      .update(payouts)
      .set({
        status: input.status,
        ...(input.status === 'PAID'
          ? {
              paidAt: now,
              reference: before.reference ?? `SIM-PAYOUT-${before.id.slice(0, 8).toUpperCase()}`,
            }
          : {}),
        ...(input.status === 'FAILED' ? { failureReason: input.reason } : {}),
      })
      .where(eq(payouts.id, payoutId))
      .returning()
    if (input.status === 'FAILED') {
      await tx.insert(workerLedgerEntries).values({
        workerId: before.workerId,
        payoutId,
        type: 'ADJUSTMENT',
        amountPaise: before.amountPaise,
        description: 'Payout failed: amount returned to your balance',
        createdAt: now,
      })
    }
    if (input.status !== 'PROCESSING') {
      await tx.insert(outboxEvents).values({
        topic: input.status === 'PAID' ? 'payout.paid' : 'payout.failed',
        payload: { payoutId },
      })
    }
    await writeAudit(tx, admin, context, {
      action: `PAYOUT_${input.status}`,
      entityType: 'payout',
      entityId: payoutId,
      before: { status: before.status },
      after: { status: after.status, reference: after.reference },
      reason: input.reason ?? null,
    })
    return toView(after)
  })
}

export const adminPayoutQuery = z.object({
  status: z
    .enum(['REQUESTED', 'PROCESSING', 'PAID', 'FAILED', 'OPEN'])
    .optional()
    .or(z.literal('').transform(() => undefined)),
  page: z.coerce.number().int().min(1).max(1000).default(1),
})

export type AdminPayoutItem = PayoutView & { workerId: string; workerName: string }

const PAGE = 25

/** Payout queue for admins, oldest open requests first. */
export async function listAdminPayouts(
  raw: unknown,
): Promise<{ items: AdminPayoutItem[]; page: number; hasMore: boolean }> {
  const q = adminPayoutQuery.parse(raw)
  const filters: SQL[] = []
  if (q.status === 'OPEN') filters.push(inArray(payouts.status, ['REQUESTED', 'PROCESSING']))
  else if (q.status) filters.push(eq(payouts.status, q.status))
  const open = sql`${payouts.status} in ('REQUESTED', 'PROCESSING')`
  const rows = await getDb()
    .select({ payout: payouts, workerName: workerProfiles.displayName })
    .from(payouts)
    .innerJoin(workerProfiles, eq(workerProfiles.id, payouts.workerId))
    .where(and(...filters))
    // Open requests first and oldest first: that is the order they should be paid.
    .orderBy(
      desc(open),
      sql`case when ${open} then ${payouts.requestedAt} end asc`,
      desc(payouts.requestedAt),
      desc(payouts.id),
    )
    .limit(PAGE + 1)
    .offset((q.page - 1) * PAGE)
  return {
    items: rows.slice(0, PAGE).map((r) => ({
      ...toView(r.payout),
      workerId: r.payout.workerId,
      workerName: r.workerName,
    })),
    page: q.page,
    hasMore: rows.length > PAGE,
  }
}
