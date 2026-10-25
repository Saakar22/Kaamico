import { connection } from 'next/server'
import { notFound } from '@/lib/errors'
import { route } from '@/lib/http'
import { verifyFileToken } from '@/lib/storage/signed-url'
import { serveFile } from '@/modules/uploads/serve'

/**
 * Serves a private file through a short-lived signed link. The link is the permission:
 * only server code that has checked access (and audited it) can mint one.
 */
export const GET = route<RouteContext<'/api/v1/files/[token]'>>(async (_request, ctx) => {
  await connection()
  const file = verifyFileToken((await ctx.params).token)
  // Forged, tampered and expired links all look the same.
  if (!file) throw notFound('This link is invalid or has expired')
  return serveFile(file, 'private, no-store')
})
