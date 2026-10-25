import { route } from '@/lib/http'
import { readJson } from '@/lib/request'
import { addTimeOff } from '@/modules/availability/schedule'
import { noStore, requireWorker } from '@/modules/workers/api'

/** 409 TIME_OFF_CONFLICT lists the confirmed jobs it would clash with. */
export const POST = route(async (request) => {
  const actor = await requireWorker(request)
  const timeOff = await addTimeOff(actor, await readJson(request))
  return Response.json({ timeOff }, { status: 201, headers: noStore })
})
