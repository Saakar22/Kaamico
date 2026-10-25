import 'server-only'
import { cookies } from 'next/headers'
import { LOCATION_COOKIE, parseLocation, type CustomerLocation } from './location'

/** The visitor's location from the cookie. Reads cookies: render inside <Suspense>. */
export async function getCustomerLocation(): Promise<CustomerLocation | null> {
  const store = await cookies()
  return parseLocation(store.get(LOCATION_COOKIE)?.value)
}
