import 'server-only'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db/client'
import { idempotencyKeys } from '@/db/schema'
import { sha256Hex } from '@/modules/auth/tokens'
import { AppError, conflict } from './errors'

const TTL_HOURS = 24
const keySchema = z.uuid()

export type StoredResponse = { status: number; body: unknown }

/** Reads and validates the `Idempotency-Key` header (required on endpoints that use it). */
export function idempotencyKeyFrom(request: Request): string {
  const key = request.headers.get('idempotency-key')
  if (!key || !keySchema.safeParse(key).success) {
    throw new AppError('VALIDATION_FAILED', 'An Idempotency-Key header (UUID) is required', {
      details: { header: 'Idempotency-Key' },
    })
  }
  return key
}

/**
 * Runs `handler` at most once per (user, key). A retry with the same body gets the
 * stored response; the same key with a different body is rejected. If the handler
 * throws, the key is released so the client can retry.
 */
export async function withIdempotency(
  opts: { userId: string; key: string; route: string; body: unknown },
  handler: () => Promise<StoredResponse>,
): Promise<StoredResponse & { replayed: boolean }> {
  const db = getDb()
  const requestHash = sha256Hex(`${opts.route}\n${JSON.stringify(opts.body ?? null)}`)
  const inserted = await db
    .insert(idempotencyKeys)
    .values({
      userId: opts.userId,
      key: opts.key,
      route: opts.route,
      requestHash,
      expiresAt: sql`now() + make_interval(hours => ${TTL_HOURS})`,
    })
    .onConflictDoNothing()
    .returning({ key: idempotencyKeys.key })

  const where = and(eq(idempotencyKeys.userId, opts.userId), eq(idempotencyKeys.key, opts.key))

  if (inserted.length === 0) {
    const [existing] = await db.select().from(idempotencyKeys).where(where)
    if (existing.requestHash !== requestHash || existing.route !== opts.route) {
      throw conflict(
        'IDEMPOTENCY_MISMATCH',
        'This Idempotency-Key was already used for a different request',
      )
    }
    if (existing.statusCode === null) {
      throw conflict('CONFLICT', 'The original request is still being processed')
    }
    return { status: existing.statusCode, body: existing.response, replayed: true }
  }

  try {
    const result = await handler()
    await db
      .update(idempotencyKeys)
      .set({ statusCode: result.status, response: result.body })
      .where(where)
    return { ...result, replayed: false }
  } catch (error) {
    await db.delete(idempotencyKeys).where(where)
    throw error
  }
}
