import { route } from '@/lib/http'
import { readJson } from '@/lib/request'
import { addDocument } from '@/modules/verification/verification'
import { noStore, requireWorker } from '@/modules/workers/api'

/** Attaches an upload as a document: `{uploadId, docType, idLast4?}`. */
export const POST = route(async (request) => {
  const actor = await requireWorker(request)
  const document = await addDocument(actor, await readJson(request))
  return Response.json({ document }, { status: 201, headers: noStore })
})
