import { connection } from 'next/server'
import { z } from 'zod'
import { route } from '@/lib/http'
import { queryParams } from '@/lib/request'
import { latitude, longitude } from '@/modules/location/location'
import { listLocalities, nearestLocality, SERVICE_AREA_KM } from '@/modules/location/localities'

const listSchema = z.object({
  city: z.string().trim().max(60).optional(),
  q: z.string().trim().max(60).optional(),
})
const nearSchema = z.object({ lat: latitude, lng: longitude })

/**
 * ?city&q lists serviceable localities for the picker. ?lat&lng returns the nearest one
 * and whether the point is inside the service area.
 */
export const GET = route(async (request) => {
  await connection()
  const params = queryParams(request)
  if (params.lat !== undefined || params.lng !== undefined) {
    const { lat, lng } = nearSchema.parse(params)
    const nearest = await nearestLocality(lat, lng)
    const inArea = nearest !== null && nearest.distanceKm <= SERVICE_AREA_KM
    return Response.json(
      { nearest, inServiceArea: inArea },
      { headers: { 'cache-control': 'no-store' } },
    )
  }
  const { city, q } = listSchema.parse(params)
  const needle = q?.toLowerCase()
  const localities = (await listLocalities()).filter(
    (l) =>
      (!city || l.city.toLowerCase() === city.toLowerCase()) &&
      (!needle || l.name.toLowerCase().includes(needle) || l.pincode?.startsWith(needle)),
  )
  return Response.json(
    { localities },
    { headers: { 'cache-control': 'public, max-age=300, stale-while-revalidate=3600' } },
  )
})
