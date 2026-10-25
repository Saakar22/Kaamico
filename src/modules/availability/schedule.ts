import 'server-only'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db/client'
import { ACTIVE_BOOKING_STATUSES, workerAvailabilityRules, workerTimeOff } from '@/db/schema'
import { AppError, conflict, notFound, pgErrorCode } from '@/lib/errors'
import type { Actor } from '@/modules/auth/types'
import { workerIdOf } from '@/modules/workers/profile'
import type { WeeklyRule } from './slots'

export const MAX_WINDOWS_PER_DAY = 3
const STEP = 15

const rule = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startMinute: z.number().int().min(0).max(1425).multipleOf(STEP),
    endMinute: z.number().int().min(15).max(1440).multipleOf(STEP),
  })
  .refine((r) => r.endMinute > r.startMinute, {
    message: 'The end time must be after the start time',
    path: ['endMinute'],
  })

export const weeklyRulesInput = z.object({
  rules: z
    .array(rule)
    .max(7 * MAX_WINDOWS_PER_DAY)
    .superRefine((rules, ctx) => {
      for (let day = 0; day < 7; day++) {
        const windows = rules
          .map((r, index) => ({ ...r, index }))
          .filter((r) => r.weekday === day)
          .sort((a, b) => a.startMinute - b.startMinute)
        if (windows.length > MAX_WINDOWS_PER_DAY) {
          ctx.addIssue({
            code: 'custom',
            path: [windows[MAX_WINDOWS_PER_DAY].index],
            message: `At most ${MAX_WINDOWS_PER_DAY} time windows per day`,
          })
        }
        for (let i = 1; i < windows.length; i++) {
          if (windows[i].startMinute < windows[i - 1].endMinute) {
            ctx.addIssue({
              code: 'custom',
              path: [windows[i].index, 'startMinute'],
              message: 'Time windows on the same day cannot overlap',
            })
          }
        }
      }
    }),
})

export async function getWeeklyRules(workerId: string): Promise<WeeklyRule[]> {
  return getDb()
    .select({
      weekday: workerAvailabilityRules.weekday,
      startMinute: workerAvailabilityRules.startMinute,
      endMinute: workerAvailabilityRules.endMinute,
    })
    .from(workerAvailabilityRules)
    .where(eq(workerAvailabilityRules.workerId, workerId))
    .orderBy(workerAvailabilityRules.weekday, workerAvailabilityRules.startMinute)
}

/**
 * Replaces the weekly hours. Existing bookings are unaffected: they were checked against
 * the hours in force when they were confirmed.
 */
export async function replaceWeeklyRules(actor: Actor, raw: unknown): Promise<WeeklyRule[]> {
  const workerId = workerIdOf(actor)
  const { rules } = weeklyRulesInput.parse(raw)
  await getDb().transaction(async (tx) => {
    await tx.delete(workerAvailabilityRules).where(eq(workerAvailabilityRules.workerId, workerId))
    if (rules.length > 0) {
      await tx.insert(workerAvailabilityRules).values(rules.map((r) => ({ workerId, ...r })))
    }
  })
  return getWeeklyRules(workerId)
}

export type TimeOff = { id: string; start: string; end: string; reason: string | null }

export async function listTimeOff(workerId: string, now: Date = new Date()): Promise<TimeOff[]> {
  const rows = await getDb().execute<{
    id: string
    start_at: Date | string
    end_at: Date | string
    reason: string | null
  }>(sql`
    select id, lower(period) as start_at, upper(period) as end_at, reason from worker_time_off
    where worker_id = ${workerId} and upper(period) > ${now.toISOString()}::timestamptz
    order by lower(period)`)
  return rows.map((r) => ({
    id: r.id,
    start: new Date(r.start_at).toISOString(),
    end: new Date(r.end_at).toISOString(),
    reason: r.reason,
  }))
}

const MAX_TIME_OFF_DAYS = 180

export const timeOffInput = z
  .object({
    start: z.iso.datetime({ offset: true }),
    end: z.iso.datetime({ offset: true }),
    reason: z
      .string()
      .trim()
      .max(120)
      .optional()
      .transform((v) => v || null),
  })
  .refine((t) => new Date(t.end) > new Date(t.start), {
    message: 'The end must be after the start',
    path: ['end'],
  })

const ACTIVE = sql.raw(`(${ACTIVE_BOOKING_STATUSES.map((s) => `'${s}'`).join(',')})`)

/** Adds time off, refusing any overlap with a confirmed job (409 with the clashing bookings). */
export async function addTimeOff(
  actor: Actor,
  raw: unknown,
  now: Date = new Date(),
): Promise<TimeOff> {
  const workerId = workerIdOf(actor)
  const input = timeOffInput.parse(raw)
  const start = new Date(input.start)
  const end = new Date(input.end)
  if (end <= now) throw new AppError('VALIDATION_FAILED', 'Time off must end in the future')
  if (end.getTime() - now.getTime() > MAX_TIME_OFF_DAYS * 86_400_000) {
    throw new AppError(
      'VALIDATION_FAILED',
      `Time off can be planned up to ${MAX_TIME_OFF_DAYS} days ahead`,
    )
  }

  return getDb().transaction(async (tx) => {
    // Lock the worker so a booking cannot be confirmed into this period meanwhile.
    await tx.execute(sql`select 1 from worker_profiles where id = ${workerId} for update`)
    const clashes = await tx.execute<{
      code: string
      start_at: Date | string
      end_at: Date | string
    }>(sql`
      select code, lower(slot) as start_at, upper(slot) as end_at from bookings
      where worker_id = ${workerId} and status in ${ACTIVE}
        and slot && tstzrange(${start.toISOString()}::timestamptz, ${end.toISOString()}::timestamptz)
      order by lower(slot)`)
    if (clashes.length > 0) {
      throw conflict('TIME_OFF_CONFLICT', 'You have confirmed jobs during this time', {
        bookings: clashes.map((c) => ({
          code: c.code,
          start: new Date(c.start_at).toISOString(),
          end: new Date(c.end_at).toISOString(),
        })),
      })
    }
    try {
      const [row] = await tx
        .insert(workerTimeOff)
        .values({
          workerId,
          period: `[${start.toISOString()},${end.toISOString()})`,
          reason: input.reason,
        })
        .returning({ id: workerTimeOff.id })
      return {
        id: row.id,
        start: start.toISOString(),
        end: end.toISOString(),
        reason: input.reason,
      }
    } catch (error) {
      if (pgErrorCode(error) === '23P01') {
        throw conflict('TIME_OFF_OVERLAP', 'This overlaps time off you already added')
      }
      throw error
    }
  })
}

export async function deleteTimeOff(actor: Actor, id: string): Promise<void> {
  const workerId = workerIdOf(actor)
  if (!z.uuid().safeParse(id).success) throw notFound('Time off not found')
  const deleted = await getDb()
    .delete(workerTimeOff)
    .where(and(eq(workerTimeOff.id, id), eq(workerTimeOff.workerId, workerId)))
    .returning({ id: workerTimeOff.id })
  if (deleted.length === 0) throw notFound('Time off not found')
}
