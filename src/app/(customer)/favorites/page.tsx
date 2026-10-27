import { Heart } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { FavoriteButton } from '@/components/domain/professionals/favorite-button'
import { RatingSummary } from '@/components/domain/professionals/rating'
import { VerificationBadge } from '@/components/domain/trust-badges'
import { PageHeader } from '@/components/patterns/page-header'
import { EmptyState } from '@/components/patterns/states'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { requirePageActor } from '@/modules/auth/page-guards'
import { listFavorites } from '@/modules/favorites/favorites'

export const instant = false

export const metadata: Metadata = { title: 'Saved professionals' }

export default async function FavoritesPage() {
  const actor = await requirePageActor('CUSTOMER')
  const favorites = await listFavorites(actor)

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <PageHeader
        title="Saved professionals"
        description="People you liked working with, ready to book again."
      />
      {favorites.length === 0 ? (
        <Card>
          <EmptyState
            icon={Heart}
            title="No saved professionals yet"
            description="Tap Save on a professional's profile to keep them here."
            action={
              <Button asChild>
                <Link href="/search">Find a professional</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {favorites.map((f) => (
            <li key={f.workerId}>
              <Card>
                <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Avatar name={f.displayName} src={f.photoUrl} />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Link
                      href={`/professionals/${f.workerId}`}
                      className="font-semibold text-brand-700 hover:underline"
                    >
                      {f.displayName}
                    </Link>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <VerificationBadge status="VERIFIED" />
                      <RatingSummary avg={f.rating.avg} count={f.rating.count} />
                    </div>
                    <p className="text-sm text-ink-600">
                      {[f.categories.join(', '), f.city].filter(Boolean).join(' · ')}
                      {f.lastJob && <> · Last job: {f.lastJob.serviceName}</>}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {f.lastJob && (
                      <Button asChild size="sm">
                        <Link href={`/book/${f.lastJob.serviceId}?worker=${f.workerId}`}>
                          Book again
                        </Link>
                      </Button>
                    )}
                    <FavoriteButton workerId={f.workerId} initial />
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
