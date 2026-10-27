import 'server-only'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db/client'
import { favorites } from '@/db/schema'
import { forbidden, notFound } from '@/lib/errors'
import type { Actor } from '@/modules/auth/types'
import { assertPublic, PUBLIC_WORKER } from '@/modules/professionals/profile'
import { photoUrl } from '@/modules/uploads/serve'

/** Saved professionals (IMPLEMENTATION_PLAN.md §10.3). PUT and DELETE are idempotent. */

function customerOf(actor: Actor): string {
  if (!actor.roles.includes('CUSTOMER')) throw forbidden('Only customers can save professionals')
  return actor.userId
}

export async function saveFavorite(actor: Actor, workerId: string) {
  const customerId = customerOf(actor)
  await assertPublic(workerId)
  await getDb().insert(favorites).values({ customerId, workerId }).onConflictDoNothing()
  return { workerId, saved: true }
}

export async function removeFavorite(actor: Actor, workerId: string) {
  const customerId = customerOf(actor)
  if (!z.uuid().safeParse(workerId).success) throw notFound('Professional not found')
  await getDb()
    .delete(favorites)
    .where(and(eq(favorites.customerId, customerId), eq(favorites.workerId, workerId)))
  return { workerId, saved: false }
}

export async function isFavorite(actor: Actor, workerId: string): Promise<boolean> {
  if (!z.uuid().safeParse(workerId).success) return false
  const rows = await getDb()
    .select({ workerId: favorites.workerId })
    .from(favorites)
    .where(and(eq(favorites.customerId, actor.userId), eq(favorites.workerId, workerId)))
  return rows.length > 0
}

export type FavoriteView = {
  workerId: string
  displayName: string
  photoUrl: string | null
  rating: { avg: number | null; count: number }
  completedJobs: number
  city: string | null
  categories: string[]
  /** Your last completed job with them, for "Book again". */
  lastJob: { serviceId: string; serviceName: string; completedAt: string } | null
  savedAt: string
}

/**
 * Saved professionals who can still be booked, newest first. Anyone who has since been
 * suspended or lost verification drops out of the list (the saved row is kept).
 */
export async function listFavorites(actor: Actor): Promise<FavoriteView[]> {
  const customerId = customerOf(actor)
  const rows = await getDb().execute<{
    worker_id: string
    display_name: string
    photo_key: string | null
    rating_sum: number
    rating_count: number
    completed_jobs: number
    city: string | null
    categories: string[] | string | null
    last_service_id: string | null
    last_service_name: string | null
    last_completed_at: Date | string | null
    saved_at: Date | string
  }>(sql`
    select w.id as worker_id, w.display_name, w.photo_key, w.rating_sum, w.rating_count,
           w.completed_jobs, l.city,
           (select array_agg(c.name order by c.sort_order) from worker_skills ws
              join service_categories c on c.id = ws.category_id
              where ws.worker_id = w.id) as categories,
           last.service_id as last_service_id, last.name as last_service_name,
           last.completed_at as last_completed_at, f.created_at as saved_at
    from favorites f
    join worker_profiles w on w.id = f.worker_id
    join users u on u.id = w.user_id
    left join localities l on l.id = w.base_locality_id
    left join lateral (
      select b.service_id, s.name, b.completed_at from bookings b
      join services s on s.id = b.service_id
      where b.customer_id = f.customer_id and b.worker_id = w.id and b.status = 'COMPLETED'
      order by b.completed_at desc limit 1
    ) last on true
    where f.customer_id = ${customerId} and ${PUBLIC_WORKER}
    order by f.created_at desc
    limit 100`)
  return rows.map((r) => ({
    workerId: r.worker_id,
    displayName: r.display_name,
    photoUrl: photoUrl(r.worker_id, r.photo_key),
    rating: {
      avg: r.rating_count > 0 ? Math.round((r.rating_sum / r.rating_count) * 10) / 10 : null,
      count: r.rating_count,
    },
    completedJobs: r.completed_jobs,
    city: r.city,
    categories: Array.isArray(r.categories)
      ? r.categories
      : (r.categories ?? '').replace(/[{}"]/g, '').split(',').filter(Boolean),
    lastJob:
      r.last_service_id && r.last_service_name && r.last_completed_at
        ? {
            serviceId: r.last_service_id,
            serviceName: r.last_service_name,
            completedAt: new Date(r.last_completed_at).toISOString(),
          }
        : null,
    savedAt: new Date(r.saved_at).toISOString(),
  }))
}
