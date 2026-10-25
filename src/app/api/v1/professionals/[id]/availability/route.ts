import { connection } from 'next/server'
import { route } from '@/lib/http'
import { queryParams } from '@/lib/request'
import { getAvailability } from '@/modules/professionals/profile'

/** Free start times for one IST day: ?serviceId&date=YYYY-MM-DD. */
export const GET = route<RouteContext<'/api/v1/professionals/[id]/availability'>>(
  async (request, ctx) => {
    await connection()
    const { id } = await ctx.params
    const availability = await getAvailability(id, queryParams(request))
    return Response.json(availability, { headers: { 'cache-control': 'no-store' } })
  },
)
