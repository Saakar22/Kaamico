import { Suspense } from 'react'
import { NotificationSlot } from '@/components/domain/notifications/notification-slot'
import { RequireAuth } from '@/components/auth/require-auth'
import { CustomerShell } from '@/components/layout/shells'
import { PageSkeleton } from '@/components/patterns/page-skeleton'

// The session gate below is request-dependent by design; pages re-check auth themselves.
export const instant = false

/** Signed-in customer area. The shell renders immediately; the session check streams in. */
export default function CustomerLayout({ children }: LayoutProps<'/'>) {
  return (
    <CustomerShell
      actions={
        <Suspense fallback={null}>
          <NotificationSlot />
        </Suspense>
      }
    >
      <Suspense fallback={<PageSkeleton />}>
        <RequireAuth>{children}</RequireAuth>
      </Suspense>
    </CustomerShell>
  )
}
