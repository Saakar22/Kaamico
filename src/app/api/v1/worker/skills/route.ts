import { route } from '@/lib/http'
import { readJson } from '@/lib/request'
import { noStore, requireWorker } from '@/modules/workers/api'
import { setSkills } from '@/modules/workers/profile'

/** Replaces the skill set (1 to 5 categories); prices outside it are switched off. */
export const PUT = route(async (request) => {
  const actor = await requireWorker(request)
  const categoryIds = await setSkills(actor, await readJson(request))
  return Response.json({ categoryIds }, { headers: noStore })
})
