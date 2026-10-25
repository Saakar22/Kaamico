import { connection } from 'next/server'
import { route } from '@/lib/http'
import { getPublicProfile } from '@/modules/professionals/profile'

/** Public profile: only VERIFIED professionals with an active account; anything else is 404. */
export const GET = route<RouteContext<'/api/v1/professionals/[id]'>>(async (_request, ctx) => {
  await connection()
  const { id } = await ctx.params
  const profile = await getPublicProfile(id)
  return Response.json({ professional: profile }, { headers: { 'cache-control': 'no-store' } })
})
