import 'server-only'
import { and, desc, eq, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db/client'
import { customerBlocks, favorites, workerProfiles } from '@/db/schema'
import { forbidden, notFound } from '@/lib/errors'
import type { Actor } from '@/modules/auth/types'
import { assertPublic } from '@/modules/professionals/profile'

/**
 * Customers can block a professional (IMPLEMENTATION_PLAN.md §11.1 filter 5): they drop out
 * of that customer's search and quick match, and new requests to them are refused.
 * Bookings that already exist are not changed. The professional is never told.
 */

function customerOf(actor: Actor): string {
  if (!actor.roles.includes('CUSTOMER')) throw forbidden('Only customers can block professionals')
  return actor.userId
}

/** Blocking also unsaves them. PUT and DELETE are idempotent. */
export async function blockWorker(actor: Actor, workerId: string) {
  const customerId = customerOf(actor)
  await assertPublic(workerId)
  if (actor.workerId === workerId) throw forbidden('You cannot block yourself')
  await getDb().transaction(async (tx) => {
    await tx.insert(customerBlocks).values({ customerId, workerId }).onConflictDoNothing()
    await tx
      .delete(favorites)
      .where(and(eq(favorites.customerId, customerId), eq(favorites.workerId, workerId)))
  })
  return { workerId, blocked: true }
}

export async function unblockWorker(actor: Actor, workerId: string) {
  const customerId = customerOf(actor)
  if (!z.uuid().safeParse(workerId).success) throw notFound('Professional not found')
  await getDb()
    .delete(customerBlocks)
    .where(and(eq(customerBlocks.customerId, customerId), eq(customerBlocks.workerId, workerId)))
  return { workerId, blocked: false }
}

export async function isBlocked(customerId: string, workerId: string): Promise<boolean> {
  if (!z.uuid().safeParse(workerId).success) return false
  const rows = await getDb()
    .select({ workerId: customerBlocks.workerId })
    .from(customerBlocks)
    .where(and(eq(customerBlocks.customerId, customerId), eq(customerBlocks.workerId, workerId)))
  return rows.length > 0
}

/** SQL filter for matching: worker alias `w` is not blocked by this customer. */
export const notBlockedBy = (customerId: string): SQL => sql`
  not exists (
    select 1 from customer_blocks cb where cb.customer_id = ${customerId} and cb.worker_id = w.id
  )`

export type BlockedView = { workerId: string; displayName: string; blockedAt: string }

export async function listBlocked(actor: Actor): Promise<BlockedView[]> {
  const customerId = customerOf(actor)
  const rows = await getDb()
    .select({
      workerId: customerBlocks.workerId,
      displayName: workerProfiles.displayName,
      blockedAt: customerBlocks.createdAt,
    })
    .from(customerBlocks)
    .innerJoin(workerProfiles, eq(workerProfiles.id, customerBlocks.workerId))
    .where(eq(customerBlocks.customerId, customerId))
    .orderBy(desc(customerBlocks.createdAt))
    .limit(200)
  return rows.map((r) => ({ ...r, blockedAt: r.blockedAt.toISOString() }))
}
