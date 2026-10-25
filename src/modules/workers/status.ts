import 'server-only'
import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db/client'
import { workerProfiles } from '@/db/schema'
import { AppError, businessRule } from '@/lib/errors'
import type { Actor } from '@/modules/auth/types'
import { matchingConfig } from '@/modules/matching/config'
import { workerIdOf } from './profile'

export const MAX_PAUSE_DAYS = 30

export const statusInput = z.object({
  online: z.boolean(),
  /** Pause new requests until this time; null clears a pause. Omit to leave it unchanged. */
  pausedUntil: z.iso.datetime({ offset: true }).nullable().optional(),
})

export type WorkerStatus = {
  online: boolean
  onlineSince: string | null
  pausedUntil: string | null
  verificationStatus: string
  /** How long a heartbeat keeps the professional "available now". */
  heartbeatMinutes: number
}

type StatusRow = {
  is_online: boolean
  online_since: Date | string | null
  paused_until: Date | string | null
  verification_status: string
}

const iso = (value: Date | string | null) => (value ? new Date(value).toISOString() : null)

function toStatus(row: StatusRow, now: Date): WorkerStatus {
  const paused = row.paused_until && new Date(row.paused_until) > now ? iso(row.paused_until) : null
  return {
    online: row.is_online,
    onlineSince: row.is_online ? iso(row.online_since) : null,
    pausedUntil: paused,
    verificationStatus: row.verification_status,
    heartbeatMinutes: matchingConfig.onlineFreshMinutes,
  }
}

export async function getStatus(workerId: string, now: Date = new Date()): Promise<WorkerStatus> {
  const [row] = await getDb().execute<StatusRow>(sql`
    select is_online, online_since, paused_until, verification_status
    from worker_profiles where id = ${workerId}`)
  return toStatus(row, now)
}

/**
 * Goes online or offline and sets or clears a pause. Only verified professionals can go
 * online (422 NOT_VERIFIED); anyone can go offline.
 */
export async function setStatus(
  actor: Actor,
  raw: unknown,
  now: Date = new Date(),
): Promise<WorkerStatus> {
  const workerId = workerIdOf(actor)
  const input = statusInput.parse(raw)
  if (input.pausedUntil) {
    const until = new Date(input.pausedUntil)
    if (until <= now) throw new AppError('VALIDATION_FAILED', 'Choose a time in the future')
    if (until.getTime() - now.getTime() > MAX_PAUSE_DAYS * 86_400_000) {
      throw new AppError('VALIDATION_FAILED', `You can pause for up to ${MAX_PAUSE_DAYS} days`)
    }
  }

  return getDb().transaction(async (tx) => {
    const [current] = await tx
      .select({ status: workerProfiles.verificationStatus, isOnline: workerProfiles.isOnline })
      .from(workerProfiles)
      .where(eq(workerProfiles.id, workerId))
      .for('update')
    if (input.online && current.status !== 'VERIFIED') {
      throw businessRule('NOT_VERIFIED', 'You can go online once your ID has been verified')
    }
    const [row] = await tx
      .update(workerProfiles)
      .set({
        isOnline: input.online,
        onlineSince: input.online ? (current.isOnline ? undefined : now) : null,
        lastActiveAt: now,
        ...(input.pausedUntil !== undefined
          ? { pausedUntil: input.pausedUntil ? new Date(input.pausedUntil) : null }
          : {}),
        version: sql`${workerProfiles.version} + 1`,
      })
      .where(eq(workerProfiles.id, workerId))
      .returning({
        is_online: workerProfiles.isOnline,
        online_since: workerProfiles.onlineSince,
        paused_until: workerProfiles.pausedUntil,
        verification_status: workerProfiles.verificationStatus,
      })
    return toStatus(row, now)
  })
}

/**
 * Called every few minutes by an open worker app. Keeps an online professional in
 * "available now" results; once the app closes they drop out after the fresh window.
 */
export async function heartbeat(actor: Actor, now: Date = new Date()): Promise<WorkerStatus> {
  const workerId = workerIdOf(actor)
  const [row] = await getDb().execute<StatusRow>(sql`
    update worker_profiles set last_active_at = ${now.toISOString()}::timestamptz
    where id = ${workerId}
    returning is_online, online_since, paused_until, verification_status`)
  return toStatus(row, now)
}
