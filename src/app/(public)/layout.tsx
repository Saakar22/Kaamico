import { Suspense } from 'react'
import { LocationSlot, LocationSlotSkeleton } from '@/components/domain/location/location-slot'
import { CustomerShell } from '@/components/layout/shells'

/** Public discovery pages: browsable signed out, with the location chip in the header. */
export default function PublicLayout({ children }: LayoutProps<'/'>) {
  return (
    <CustomerShell
      headerSlot={
        <Suspense fallback={<LocationSlotSkeleton />}>
          <LocationSlot />
        </Suspense>
      }
    >
      {children}
    </CustomerShell>
  )
}
