import { AppError } from '@/lib/errors'
import { route } from '@/lib/http'
import { requireApiActor } from '@/modules/auth/actor'
import {
  createUpload,
  fileTooLarge,
  MAX_PDF_BYTES,
  uploadPurposeSchema,
} from '@/modules/uploads/uploads'

/** Room for the multipart envelope around the largest allowed file. */
const MAX_BODY_BYTES = MAX_PDF_BYTES + 64 * 1024

/**
 * Multipart upload (`file`, `purpose`) into private storage. Returns an `uploadId` to
 * attach to a document or profile; the file itself is never publicly addressable.
 */
export const POST = route(async (request) => {
  const actor = await requireApiActor(request)
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > MAX_BODY_BYTES) throw fileTooLarge(MAX_PDF_BYTES)

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    throw new AppError('VALIDATION_FAILED', 'Send the file as multipart form data')
  }
  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) {
    throw new AppError('VALIDATION_FAILED', 'Choose a file to upload', {
      details: { issues: [{ path: 'file', message: 'Choose a file to upload' }] },
    })
  }
  if (file.size > MAX_PDF_BYTES) throw fileTooLarge(MAX_PDF_BYTES)
  const purpose = uploadPurposeSchema.parse(form.get('purpose'))

  const result = await createUpload(actor, {
    bytes: new Uint8Array(await file.arrayBuffer()),
    purpose,
  })
  return Response.json(result, { status: 201, headers: { 'cache-control': 'no-store' } })
})
