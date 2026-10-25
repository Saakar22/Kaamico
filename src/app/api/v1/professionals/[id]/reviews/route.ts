import { connection } from 'next/server'
import { route } from '@/lib/http'
import { queryParams } from '@/lib/request'
import { getPublicReviews } from '@/modules/professionals/profile'

export const GET = route<RouteContext<'/api/v1/professionals/[id]/reviews'>>(
  async (request, ctx) => {
    await connection()
    const { id } = await ctx.params
    const reviews = await getPublicReviews(id, queryParams(request))
    return Response.json(reviews, { headers: { 'cache-control': 'no-store' } })
  },
)
