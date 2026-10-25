import { connection } from 'next/server'
import { z } from 'zod'
import { notFound } from '@/lib/errors'
import { route } from '@/lib/http'
import { queryParams } from '@/lib/request'
import { getCategoryWithNearbyPrices } from '@/modules/catalog/nearby'
import { latitude, longitude } from '@/modules/location/location'

const querySchema = z
  .object({ lat: latitude.optional(), lng: longitude.optional() })
  .refine(
    (q) => (q.lat === undefined) === (q.lng === undefined),
    'Send both lat and lng, or neither',
  )

/** A category with its services; with ?lat&lng, real price ranges from professionals nearby. */
export const GET = route<RouteContext<'/api/v1/categories/[slug]'>>(async (request, ctx) => {
  await connection()
  const { slug } = await ctx.params
  const point = querySchema.parse(queryParams(request))
  const category = await getCategoryWithNearbyPrices(
    slug,
    point.lat === undefined || point.lng === undefined ? null : { lat: point.lat, lng: point.lng },
  )
  if (!category) throw notFound('Category not found')
  return Response.json({ category }, { headers: { 'cache-control': 'no-store' } })
})
