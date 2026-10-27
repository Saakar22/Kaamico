import { Heart } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { getActor } from '@/modules/auth/actor'
import { isFavorite } from '@/modules/favorites/favorites'
import { FavoriteButton } from './favorite-button'

/**
 * The save button on a public profile. Signed-out visitors are sent to sign in first;
 * professionals and admins see nothing. Reads cookies: render inside <Suspense>.
 */
export async function FavoriteSlot({ workerId }: { workerId: string }) {
  const actor = await getActor()
  if (!actor) {
    return (
      <Button asChild variant="secondary" size="sm" className="w-fit">
        <Link href={`/login?next=${encodeURIComponent(`/professionals/${workerId}`)}`}>
          <Heart aria-hidden="true" />
          Save
        </Link>
      </Button>
    )
  }
  if (actor.scope !== 'USER' || actor.needsOnboarding || !actor.roles.includes('CUSTOMER')) {
    return null
  }
  if (actor.workerId === workerId) return null
  return <FavoriteButton workerId={workerId} initial={await isFavorite(actor, workerId)} />
}
