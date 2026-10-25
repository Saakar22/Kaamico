/** Mean Earth radius in km; matches the kaamico_haversine_km SQL function. */
const EARTH_RADIUS_KM = 6371.0088

const rad = (deg: number) => (deg * Math.PI) / 180

/** Great-circle (straight-line) distance in km. Not road distance. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a))
}
