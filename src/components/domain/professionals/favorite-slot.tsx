import { Heart } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { getT } from '@/i18n/server'
import { getActor } from '@/modules/auth/actor'
import { isBlocked } from '@/modules/favorites/blocks'
import { isFavorite } from '@/modules/favorites/favorites'
import { BlockButton, UnblockButton } from './block-button'
import { FavoriteButton } from './favorite-button'

/**
 * Save and block on a public profile. Signed-out visitors are sent to sign in first;
 * professionals and admins see nothing. Reads cookies: render inside <Suspense>.
 */
export async function FavoriteSlot({ workerId, name }: { workerId: string; name: string }) {
  const [actor, t] = await Promise.all([getActor(), getT()])
  if (!actor) {
    return (
      <Button asChild variant="secondary" size="sm" className="w-fit">
        <Link href={`/login?next=${encodeURIComponent(`/professionals/${workerId}`)}`}>
          <Heart aria-hidden="true" />
          {t('favorites.save')}
        </Link>
      </Button>
    )
  }
  if (actor.scope !== 'USER' || actor.needsOnboarding || !actor.roles.includes('CUSTOMER')) {
    return null
  }
  if (actor.workerId === workerId) return null
  const [saved, blocked] = await Promise.all([
    isFavorite(actor, workerId),
    isBlocked(actor.userId, workerId),
  ])
  if (blocked) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-ink-600">{t('blocks.youBlocked', { name })}</p>
        <UnblockButton workerId={workerId} name={name} />
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <FavoriteButton workerId={workerId} initial={saved} />
      <BlockButton workerId={workerId} name={name} />
    </div>
  )
}
