import { connection } from 'next/server'
import { route } from '@/lib/http'
import { limitSearches } from '@/lib/rate-limit'
import { queryParams } from '@/lib/request'
import { getActorFromRequest } from '@/modules/auth/actor'
import { searchProfessionals } from '@/modules/matching/search'

/** Ranked professionals for a service near a point (IMPLEMENTATION_PLAN.md §11.1). */
export const GET = route(async (request) => {
  await connection()
  await limitSearches(request)
  const actor = await getActorFromRequest(request)
  const result = await searchProfessionals(
    queryParams(request),
    new Date(),
    actor?.roles.includes('CUSTOMER') ? actor.userId : undefined,
  )
  return Response.json(result, { headers: { 'cache-control': 'no-store' } })
})
