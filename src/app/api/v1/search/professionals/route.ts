import { connection } from 'next/server'
import { route } from '@/lib/http'
import { limitSearches } from '@/lib/rate-limit'
import { queryParams } from '@/lib/request'
import { searchProfessionals } from '@/modules/matching/search'

/** Ranked professionals for a service near a point (IMPLEMENTATION_PLAN.md §11.1). */
export const GET = route(async (request) => {
  await connection()
  await limitSearches(request)
  const result = await searchProfessionals(queryParams(request))
  return Response.json(result, { headers: { 'cache-control': 'no-store' } })
})
