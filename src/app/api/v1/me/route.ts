import { route } from '@/lib/http'
import { readJson } from '@/lib/request'
import { updateAccount } from '@/modules/auth/account'
import { requireApiActor } from '@/modules/auth/actor'
import { publicUser } from '@/modules/auth/responses'

const noStore = { 'cache-control': 'no-store' }

// Reads the request's cookies, so it always runs at request time.
export const GET = route(async (request) => {
  const actor = await requireApiActor(request, { allowOnboarding: true })
  return Response.json({ user: publicUser(actor) }, { headers: noStore })
})

/** `{name, email}`: the signed-in person's own details. The phone number never changes here. */
export const PATCH = route(async (request) => {
  const actor = await requireApiActor(request)
  const account = await updateAccount(actor, await readJson(request))
  return Response.json({ account }, { headers: noStore })
})
