import { route } from '@/lib/http'
import { readJson } from '@/lib/request'
import { requireApiActor } from '@/modules/auth/actor'
import { createTicket, listMyTickets } from '@/modules/support/support'

export const GET = route(async (request) => {
  const actor = await requireApiActor(request)
  return Response.json(
    { tickets: await listMyTickets(actor) },
    { headers: { 'cache-control': 'no-store' } },
  )
})

/** `{category, subject, message, bookingId?}` */
export const POST = route(async (request) => {
  const actor = await requireApiActor(request)
  return Response.json(await createTicket(actor, await readJson(request)), { status: 201 })
})
