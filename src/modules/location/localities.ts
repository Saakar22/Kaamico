import 'server-only'
import { sql } from 'drizzle-orm'
import { cacheLife, cacheTag } from 'next/cache'
import { getDb } from '@/db/client'

export type Locality = {
  id: string
  city: string
  name: string
  pincode: string | null
  lat: number
  lng: number
}

/** A device location further than this from every serviceable locality is out of area. */
export const SERVICE_AREA_KM = 15

type LocalityRow = Locality & { pincode: string | null }

/** Serviceable localities, grouped by city in display order. Reference data: cached. */
export async function listLocalities(): Promise<Locality[]> {
  'use cache'
  cacheLife('hours')
  cacheTag('localities')
  const rows = await getDb().execute<LocalityRow>(sql`
    select id, city, name, pincode, lat, lng from localities
    where is_serviceable order by city, name`)
  return rows.map((r) => ({ ...r, lat: Number(r.lat), lng: Number(r.lng) }))
}

/** Nearest serviceable locality to a point, with the straight-line distance. */
export async function nearestLocality(
  lat: number,
  lng: number,
): Promise<(Locality & { distanceKm: number }) | null> {
  const rows = await getDb().execute<LocalityRow & { distance_km: number }>(sql`
    select id, city, name, pincode, lat, lng, kaamico_haversine_km(${lat}, ${lng}, lat, lng) as distance_km
    from localities where is_serviceable
    order by distance_km limit 1`)
  const row = rows[0]
  if (!row) return null
  const { distance_km, ...locality } = row
  return {
    ...locality,
    lat: Number(locality.lat),
    lng: Number(locality.lng),
    distanceKm: Number(distance_km),
  }
}
