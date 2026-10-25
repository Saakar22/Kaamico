import { Skeleton } from '@/components/ui/skeleton'
import { listLocalities } from '@/modules/location/localities'
import { getCustomerLocation } from '@/modules/location/server'
import { LocationChip } from './location-chip'

/** Header location chip. Reads the location cookie: render inside <Suspense>. */
export async function LocationSlot() {
  const [location, localities] = await Promise.all([getCustomerLocation(), listLocalities()])
  return <LocationChip location={location} localities={localities} />
}

export function LocationSlotSkeleton() {
  return <Skeleton className="h-11 w-40 rounded-full" />
}
