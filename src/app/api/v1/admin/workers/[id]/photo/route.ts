import { connection } from 'next/server'
import { z } from 'zod'
import { notFound } from '@/lib/errors'
import { route } from '@/lib/http'
import { requireAdmin } from '@/modules/admin/api'
import { ownPhoto, serveFile } from '@/modules/uploads/serve'

/** Any professional's profile photo, to compare with their selfie during review. */
export const GET = route<RouteContext<'/api/v1/admin/workers/[id]/photo'>>(async (request, ctx) => {
  await connection()
  await requireAdmin(request)
  const { id } = await ctx.params
  const photo = z.uuid().safeParse(id).success ? await ownPhoto(id) : null
  if (!photo) throw notFound('No photo')
  return serveFile(photo, 'private, no-store')
})
