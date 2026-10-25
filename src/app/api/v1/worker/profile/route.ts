import { route } from '@/lib/http'
import { readJson } from '@/lib/request'
import { noStore, requireWorker } from '@/modules/workers/api'
import { getOwnProfile, updateProfile } from '@/modules/workers/profile'

export const GET = route(async (request) => {
  const actor = await requireWorker(request)
  return Response.json({ profile: await getOwnProfile(actor.workerId) }, { headers: noStore })
})

export const PATCH = route(async (request) => {
  const actor = await requireWorker(request)
  const profile = await updateProfile(actor, await readJson(request))
  return Response.json({ profile }, { headers: noStore })
})
