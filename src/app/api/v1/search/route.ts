import { connection } from 'next/server'
import { z } from 'zod'
import { route } from '@/lib/http'
import { queryParams } from '@/lib/request'
import { searchQuerySchema, searchServices } from '@/modules/catalog/catalog'

/** Text search over services, e.g. ?q=plumber or ?q=nal. */
export const GET = route(async (request) => {
  await connection()
  const { q } = z.object({ q: searchQuerySchema }).parse(queryParams(request))
  const services = await searchServices(q)
  return Response.json({ services }, { headers: { 'cache-control': 'no-store' } })
})
