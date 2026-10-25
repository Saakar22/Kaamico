import { connection } from 'next/server'
import { z } from 'zod'
import { notFound } from '@/lib/errors'
import { route } from '@/lib/http'
import { publicPhoto, serveFile } from '@/modules/uploads/serve'

/** A public professional's profile photo (metadata already stripped at upload). */
export const GET = route<RouteContext<'/api/v1/professionals/[id]/photo'>>(
  async (_request, ctx) => {
    await connection()
    const { id } = await ctx.params
    const photo = z.uuid().safeParse(id).success ? await publicPhoto(id) : null
    if (!photo) throw notFound('No photo')
    // The URL carries a version, so a changed photo gets a new URL.
    return serveFile(photo, 'public, max-age=86400')
  },
)
