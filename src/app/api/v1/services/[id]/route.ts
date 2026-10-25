import { connection } from 'next/server'
import { notFound } from '@/lib/errors'
import { route } from '@/lib/http'
import { getService } from '@/modules/catalog/catalog'

export const GET = route<RouteContext<'/api/v1/services/[id]'>>(async (_request, ctx) => {
  await connection()
  const { id } = await ctx.params
  const service = await getService(id)
  if (!service) throw notFound('Service not found')
  return Response.json(
    { service },
    { headers: { 'cache-control': 'public, max-age=60, stale-while-revalidate=300' } },
  )
})
