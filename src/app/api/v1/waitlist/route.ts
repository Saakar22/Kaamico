import { route } from '@/lib/http'
import { clientIp, readJson } from '@/lib/request'
import { joinWaitlist } from '@/modules/location/waitlist'

/** `{city, contact, categoryId?, lat?, lng?}`: hear when Kaamico reaches your city. Public. */
export const POST = route(async (request) => {
  const body = await readJson(request)
  return Response.json(await joinWaitlist(body, clientIp(request)), { status: 201 })
})
