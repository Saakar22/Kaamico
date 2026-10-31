import { Suspense } from 'react'
import { NotificationSlot } from '@/components/domain/notifications/notification-slot'
import { LocationSlot, LocationSlotSkeleton } from '@/components/domain/location/location-slot'
import { CustomerShell } from '@/components/layout/shells'

/** Public discovery pages: browsable signed out, with the location chip in the header. */
export default function PublicLayout({ children }: LayoutProps<'/[lang]'>) {
  return (
    <CustomerShell
      actions={
        <Suspense fallback={null}>
          <NotificationSlot />
        </Suspense>
      }
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
