import { connection } from 'next/server'
import { getEnv } from '@/config/env'
import { getActor } from '@/modules/auth/actor'
import type { SessionScope } from '@/modules/auth/types'
import { countUnread } from '@/modules/notifications/notifications'
import { NotificationBell } from './notification-bell'

/**
 * Header bell for signed-in customers and professionals, or (scope ADMIN) for the admin
 * console. Reads cookies: render inside <Suspense>.
 */
export async function NotificationSlot({ scope = 'USER' }: { scope?: SessionScope }) {
  const actor = await getActor()
  if (!actor || actor.scope !== scope || actor.needsOnboarding) return null
  // Counting first delivers pending events, which reads the clock: request time only.
  await connection()
  return (
    <NotificationBell
      initialUnread={await countUnread(actor.userId)}
      live={getEnv().REALTIME_MODE === 'sse'}
      emptyText={
        scope === 'ADMIN' ? 'Nothing yet. New ID documents to review appear here.' : undefined
      }
    />
  )
}
