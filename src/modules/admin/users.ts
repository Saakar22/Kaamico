import 'server-only'
import { eq, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db/client'
import { authSessions, users, workerProfiles } from '@/db/schema'
import { conflict, forbidden, notFound } from '@/lib/errors'
import { writeAudit, type AuditContext } from '@/modules/audit/audit'
import type { Actor } from '@/modules/auth/types'
import { lockBooking } from '@/modules/bookings/repo'
import type { BookingStatus } from '@/modules/bookings/state-machine'
import { cancelAsAdmin } from './bookings'

const iso = (v: Date | string | null) => (v ? new Date(v).toISOString() : null)
const PAGE = 25

export const adminUserQuery = z.object({
  q: z.string().trim().max(80).optional(),
  role: z
    .enum(['CUSTOMER', 'WORKER', 'ADMIN'])
    .optional()
    .or(z.literal('').transform(() => undefined)),
  status: z
    .enum(['ACTIVE', 'SUSPENDED'])
    .optional()
    .or(z.literal('').transform(() => undefined)),
  page: z.coerce.number().int().min(1).max(1000).default(1),
})

export type AdminUserItem = {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  roles: string[]
  status: string
  createdAt: string
  lastLoginAt: string | null
  worker: {
    id: string
    verificationStatus: string
    ratingAvg: number | null
    completedJobs: number
    cancellations: number
  } | null
  bookings: number
}

/** Customers, professionals and admins: search by name, phone or email (§5.3 `/admin/users`). */
export async function listAdminUsers(
  raw: unknown,
): Promise<{ items: AdminUserItem[]; page: number; hasMore: boolean }> {
  const q = adminUserQuery.parse(raw)
  const filters: SQL[] = [sql`u.deleted_at is null`]
  if (q.role) filters.push(sql`${q.role}::user_role = any(u.roles)`)
  if (q.status) filters.push(sql`u.status = ${q.status}`)
  if (q.q) {
    const like = `%${q.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
    filters.push(
      sql`(u.name ilike ${like} or u.phone like ${like} or u.email::text ilike ${like} or w.display_name ilike ${like})`,
    )
  }
  const rows = await getDb().execute<{
    id: string
    name: string | null
    phone: string | null
    email: string | null
    roles: string[] | string
    status: string
    created_at: Date | string
    last_login_at: Date | string | null
    worker_id: string | null
    verification_status: string | null
    rating_sum: number | null
    rating_count: number | null
    completed_jobs: number | null
    cancellations: number | null
    bookings: number
  }>(sql`
    select u.id, u.name, u.phone, u.email::text as email, u.roles::text[] as roles, u.status,
           u.created_at, u.last_login_at, w.id as worker_id, w.verification_status,
           w.rating_sum, w.rating_count, w.completed_jobs,
           w.cancellations_by_worker as cancellations,
           (select count(*)::int from bookings b where b.customer_id = u.id) as bookings
    from users u
    left join worker_profiles w on w.user_id = u.id
    where ${sql.join(filters, sql` and `)}
    order by u.created_at desc, u.id desc
    limit ${PAGE + 1} offset ${(q.page - 1) * PAGE}`)
  return {
    items: rows.slice(0, PAGE).map((r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      email: r.email,
      roles: Array.isArray(r.roles) ? r.roles : r.roles.replace(/[{}]/g, '').split(','),
      status: r.status,
      createdAt: iso(r.created_at)!,
      lastLoginAt: iso(r.last_login_at),
      worker: r.worker_id
        ? {
            id: r.worker_id,
            verificationStatus: r.verification_status!,
            ratingAvg:
              r.rating_count && r.rating_count > 0
                ? Math.round((r.rating_sum! / r.rating_count) * 10) / 10
                : null,
            completedJobs: r.completed_jobs ?? 0,
            cancellations: r.cancellations ?? 0,
          }
        : null,
      bookings: r.bookings,
    })),
    page: q.page,
    hasMore: rows.length > PAGE,
  }
}

export const userStatusInput = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  reason: z.string().trim().min(10, 'Give a reason (at least 10 characters)').max(500),
})

const UNAVAILABLE = 'Cancelled by Kaamico: the account is not available'

/**
 * Suspends or reactivates a customer or professional (§10.15). Suspending signs them out
 * everywhere, takes a professional offline and cancels their open requests; confirmed
 * jobs are left for an admin to handle one by one. Admin accounts cannot be changed here.
 */
export async function setUserStatus(
  admin: Actor,
  userId: string,
  raw: unknown,
  context: AuditContext,
  now: Date = new Date(),
) {
  const input = userStatusInput.parse(raw)
  if (!z.uuid().safeParse(userId).success) throw notFound('User not found')
  return getDb().transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).for('update')
    if (!user || user.deletedAt) throw notFound('User not found')
    if (user.roles.includes('ADMIN')) throw forbidden('Admin accounts are managed separately')
    if (user.status === input.status) {
      throw conflict('NO_CHANGE', `This account is already ${input.status.toLowerCase()}`)
    }

    await tx.update(users).set({ status: input.status }).where(eq(users.id, userId))
    let cancelled = 0
    if (input.status === 'SUSPENDED') {
      await tx.delete(authSessions).where(eq(authSessions.userId, userId))
      await tx
        .update(workerProfiles)
        .set({ isOnline: false, version: sql`${workerProfiles.version} + 1` })
        .where(eq(workerProfiles.userId, userId))
      const open = await tx.execute<{ id: string }>(sql`
        select distinct b.id from bookings b
        left join booking_invitations i on i.booking_id = b.id
        left join worker_profiles w on w.id = i.worker_id
        where b.status in ('REQUESTED', 'NEGOTIATING')
          and (b.customer_id = ${userId} or w.user_id = ${userId})
        order by b.id`)
      for (const { id } of open) {
        const booking = await lockBooking(tx, id)
        await cancelAsAdmin(
          tx,
          admin,
          booking as { id: string; status: BookingStatus; version: number },
          UNAVAILABLE,
          now,
        )
        cancelled++
      }
    }
    await writeAudit(tx, admin, context, {
      action: input.status === 'SUSPENDED' ? 'USER_SUSPENDED' : 'USER_REACTIVATED',
      entityType: 'user',
      entityId: userId,
      before: { status: user.status },
      after: { status: input.status, cancelledRequests: cancelled },
      reason: input.reason,
    })
    return { userId, status: input.status, cancelledRequests: cancelled }
  })
}
