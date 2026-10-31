import { Suspense } from 'react'
import { NotificationSlot } from '@/components/domain/notifications/notification-slot'
import { RequireAuth } from '@/components/auth/require-auth'
import { WorkerShell } from '@/components/layout/shells'
import { PageSkeleton } from '@/components/patterns/page-skeleton'

// The session gate below is request-dependent by design; pages re-check auth themselves.
export const instant = false

/** Every /worker route requires the WORKER role (checked on the server). */
export default function WorkerLayout({ children }: LayoutProps<'/[lang]/worker'>) {
  return (
    <WorkerShell
      actions={
        <Suspense fallback={null}>
          <NotificationSlot />
        </Suspense>
      }
    >
      <Suspense fallback={<PageSkeleton />}>
        <RequireAuth role="WORKER">{children}</RequireAuth>
      </Suspense>
    </WorkerShell>
  )
}
