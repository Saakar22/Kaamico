import { route } from '@/lib/http'
import { readJson } from '@/lib/request'
import { getWeeklyRules, listTimeOff, replaceWeeklyRules } from '@/modules/availability/schedule'
import { noStore, requireWorker } from '@/modules/workers/api'

export const GET = route(async (request) => {
  const actor = await requireWorker(request)
  const [rules, timeOff] = await Promise.all([
    getWeeklyRules(actor.workerId),
    listTimeOff(actor.workerId),
  ])
  return Response.json({ rules, timeOff }, { headers: noStore })
})

/** Replaces the weekly hours: at most 3 non-overlapping windows per day. */
export const PUT = route(async (request) => {
  const actor = await requireWorker(request)
  const rules = await replaceWeeklyRules(actor, await readJson(request))
  return Response.json({ rules }, { headers: noStore })
})
