import { Suspense } from 'react'
import { NotificationSlot } from '@/components/domain/notifications/notification-slot'
import { RequireAuth } from '@/components/auth/require-auth'
import { AdminShell } from '@/components/layout/shells'
import { PageSkeleton } from '@/components/patterns/page-skeleton'

// The session gate below is request-dependent by design; pages re-check auth themselves.
export const instant = false

/** Admin console: requires the ADMIN role and a session from the admin sign-in. */
export default function AdminConsoleLayout({ children }: LayoutProps<'/[lang]/admin'>) {
  return (
    <AdminShell
      actions={
        <Suspense fallback={null}>
          <NotificationSlot scope="ADMIN" />
        </Suspense>
      }
    >
      <Suspense fallback={<PageSkeleton />}>
        <RequireAuth role="ADMIN">{children}</RequireAuth>
      </Suspense>
    </AdminShell>
  )
}
