import { route } from '@/lib/http'
import { notFound } from '@/lib/errors'
import { ownPhoto, serveFile } from '@/modules/uploads/serve'
import { requireWorker } from '@/modules/workers/api'

/** The signed-in professional's own photo (visible to them even before verification). */
export const GET = route(async (request) => {
  const actor = await requireWorker(request)
  const photo = await ownPhoto(actor.workerId)
  if (!photo) throw notFound('No photo yet')
  return serveFile(photo, 'private, no-store')
})
