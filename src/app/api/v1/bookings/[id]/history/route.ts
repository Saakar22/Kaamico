import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/db/client'
import { notFound } from '@/lib/errors'
import { route } from '@/lib/http'
import { requireApiActor } from '@/modules/auth/actor'
import { hasRole } from '@/modules/auth/types'

/** Status history for the booking's customer, its assigned professional, or an admin. */
export const GET = route<RouteContext<'/api/v1/bookings/[id]/history'>>(async (request, ctx) => {
  const actor = await requireApiActor(request)
  const { id } = await ctx.params
  if (!z.uuid().safeParse(id).success) throw notFound('Booking not found')
  const isAdmin = hasRole(actor, 'ADMIN')
  const rows = await getDb().execute<{
    from_status: string | null
    to_status: string
    actor_role: string
    reason: string | null
    created_at: Date
  }>(sql`
    select h.from_status, h.to_status, h.actor_role, h.reason, h.created_at
    from booking_status_history h join bookings b on b.id = h.booking_id
    where h.booking_id = ${id}
      and (${isAdmin} or b.customer_id = ${actor.userId} or b.worker_id = ${actor.workerId})
    order by h.created_at, h.id`)
  if (rows.length === 0) throw notFound('Booking not found')
  return Response.json(
    {
      history: rows.map((r) => ({
        from: r.from_status,
        to: r.to_status,
        actor: r.actor_role,
        reason: r.reason,
        at: new Date(r.created_at).toISOString(),
      })),
    },
    { headers: { 'cache-control': 'no-store' } },
  )
})
