import { route } from '@/lib/http'
import { readJson } from '@/lib/request'
import { createAddress, listAddresses } from '@/modules/addresses/addresses'
import { requireApiActor } from '@/modules/auth/actor'

export const GET = route(async (request) => {
  const actor = await requireApiActor(request)
  return Response.json(
    { addresses: await listAddresses(actor.userId) },
    { headers: { 'cache-control': 'no-store' } },
  )
})

export const POST = route(async (request) => {
  const actor = await requireApiActor(request)
  const address = await createAddress(actor, await readJson(request))
  return Response.json({ address }, { status: 201, headers: { 'cache-control': 'no-store' } })
})
