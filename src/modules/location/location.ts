import { z } from 'zod'

/** Cookie holding the visitor's chosen location (not sensitive: a locality or rough point). */
export const LOCATION_COOKIE = 'kmc_loc'
export const LOCATION_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

/** India's bounding box; anything outside is rejected before it reaches a query. */
export const latitude = z.coerce.number().min(6).max(37)
export const longitude = z.coerce.number().min(68).max(98)

export const customerLocationSchema = z.object({
  lat: latitude,
  lng: longitude,
  /** Shown on the location chip, e.g. "Kothrud, Pune" or "Near Baner, Pune". */
  label: z.string().trim().min(1).max(120),
  city: z.string().trim().min(1).max(60),
  localityId: z.uuid().nullish(),
  source: z.enum(['locality', 'device']),
})

export type CustomerLocation = z.infer<typeof customerLocationSchema>

export function serializeLocation(location: CustomerLocation): string {
  return encodeURIComponent(JSON.stringify(location))
}

/** Parses the cookie value; anything malformed counts as "no location". */
export function parseLocation(value: string | undefined | null): CustomerLocation | null {
  if (!value) return null
  try {
    const parsed = customerLocationSchema.safeParse(JSON.parse(decodeURIComponent(value)))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
