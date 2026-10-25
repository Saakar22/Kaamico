import { getActor } from '@/modules/auth/actor'
import { countUnread } from '@/modules/notifications/notifications'
import { NotificationBell } from './notification-bell'

/** Header bell for signed-in customers and professionals. Reads cookies: render inside <Suspense>. */
export async function NotificationSlot() {
  const actor = await getActor()
  if (!actor || actor.scope !== 'USER' || actor.needsOnboarding) return null
  return <NotificationBell initialUnread={await countUnread(actor.userId)} />
}
