import {
  BriefcaseBusiness,
  CalendarClock,
  ChevronLeft,
  Languages,
  MapPin,
  Sprout,
} from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { RatingStars, RatingSummary } from '@/components/domain/professionals/rating'
import { VerificationBadge } from '@/components/domain/trust-badges'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Money } from '@/components/ui/money'
import { Skeleton } from '@/components/ui/skeleton'
import { AppError } from '@/lib/errors'
import { cn } from '@/lib/cn'
import { formatIstDay, formatIstTime, istDateKey } from '@/lib/time'
import { formatDuration, unitSpoken, unitSuffix } from '@/modules/catalog/units'
import { languageNames } from '@/modules/professionals/languages'
import {
  getAvailability,
  getPublicProfile,
  getPublicReviews,
  type PublicProfile,
  type ReviewPage,
} from '@/modules/professionals/profile'

type Props = PageProps<'/professionals/[id]'>

export const metadata: Metadata = { title: 'Professional profile' }

const PREVIEW_DAYS = 3
const PREVIEW_TIMES = 4

const TAG_LABELS: Record<string, string> = {
  on_time: 'On time',
  polite: 'Polite',
  fair_price: 'Fair price',
  clean_work: 'Clean work',
  skilled: 'Skilled',
  explained_well: 'Explained well',
}

const monthYear = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' })
const fullDate = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Kolkata',
})

async function loadProfile(id: string): Promise<PublicProfile> {
  try {
    return await getPublicProfile(id)
  } catch (error) {
    // Unverified, suspended and unknown professionals all look the same: not found.
    if (error instanceof AppError && error.status === 404) notFound()
    throw error
  }
}

function ProfileHeader({ profile }: { profile: PublicProfile }) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <Avatar name={profile.displayName} src={profile.photoUrl} size="lg" />
      <div className="flex min-w-0 flex-col gap-2">
        <h1 className="font-display text-2xl leading-tight font-bold sm:text-3xl">
          {profile.displayName}
        </h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <VerificationBadge status="VERIFIED" />
          {profile.isNew && (
            <Badge tone="info">
              <Sprout aria-hidden="true" />
              New on Kaamico
            </Badge>
          )}
          <RatingSummary avg={profile.rating.avg} count={profile.rating.count} />
        </div>
        {profile.verifiedOn && (
          <p className="text-sm text-ink-600">
            ID checked by Kaamico on {fullDate.format(new Date(profile.verifiedOn))}
          </p>
        )}
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-600">
          <li className="flex items-center gap-1.5">
            <BriefcaseBusiness aria-hidden="true" className="size-4" />
            {profile.completedJobs} jobs done
            {profile.yearsExperience > 0 && <> · {profile.yearsExperience} yrs experience</>}
          </li>
          {profile.languages.length > 0 && (
            <li className="flex items-center gap-1.5">
              <Languages aria-hidden="true" className="size-4" />
              Speaks {languageNames(profile.languages)}
            </li>
          )}
          {profile.city && (
            <li className="flex items-center gap-1.5">
              <MapPin aria-hidden="true" className="size-4" />
              Works in {profile.city}
            </li>
          )}
        </ul>
      </div>
    </header>
  )
}

function ServicePriceList({ profile, highlight }: { profile: PublicProfile; highlight?: string }) {
  const firstName = profile.displayName.split(' ')[0]
  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg leading-snug font-semibold">Services and prices</h2>
        <p className="text-sm text-ink-600">Prices are set by {firstName}.</p>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y divide-border">
          {profile.services.map((s) => (
            <li
              key={s.serviceId}
              className={cn(
                'flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4',
                s.serviceId === highlight &&
                  '-mx-2 rounded-md bg-brand-50 px-2 first:pt-2 last:pb-2',
              )}
            >
              <div className="flex flex-col">
                <span className="font-medium">{s.name}</span>
                <span className="text-sm text-ink-600">
                  {s.category.name} · about {formatDuration(s.typicalDurationMin)}
                </span>
              </div>
              <div className="flex flex-col sm:items-end">
                <span>
                  <Money paise={s.pricePaise} className="font-semibold" />{' '}
                  <span className="text-sm text-ink-600" aria-hidden="true">
                    {unitSuffix(s.unit)}
                  </span>
                  <span className="sr-only">{unitSpoken(s.unit)}</span>
                </span>
                <span className="text-sm text-ink-600">
                  {s.negotiable ? 'Open to offers' : 'Fixed price'}
                  {s.minChargePaise > 0 && (
                    <>
                      {' · '}minimum <Money paise={s.minChargePaise} />
                    </>
                  )}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

async function AvailabilityPreview({
  workerId,
  serviceId,
}: {
  workerId: string
  serviceId?: string
}) {
  await connection()
  const now = new Date()
  const days = await Promise.all(
    Array.from({ length: PREVIEW_DAYS }, (_, i) =>
      getAvailability(
        workerId,
        { serviceId, date: istDateKey(new Date(now.getTime() + i * 86_400_000)) },
        now,
      ),
    ),
  )
  const withSlots = days.filter((d) => d.slots.length > 0)
  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg leading-snug font-semibold">Upcoming free times</h2>
      </CardHeader>
      <CardContent>
        {withSlots.length === 0 ? (
          <p className="text-ink-600">No free times in the next {PREVIEW_DAYS} days.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {withSlots.map((d) => (
              <li key={d.date} className="flex flex-col gap-1.5">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <CalendarClock aria-hidden="true" className="size-4 text-ink-600" />
                  {formatIstDay(new Date(d.slots[0].start), now)}
                </span>
                <ul className="flex flex-wrap gap-2" aria-label="Start times">
                  {d.slots.slice(0, PREVIEW_TIMES).map((s) => (
                    <li
                      key={s.start}
                      className="rounded-full border border-border px-3 py-1 text-sm tabular-nums"
                    >
                      {formatIstTime(new Date(s.start))}
                    </li>
                  ))}
                  {d.slots.length > PREVIEW_TIMES && (
                    <li className="px-1 py-1 text-sm text-ink-600">
                      +{d.slots.length - PREVIEW_TIMES} more
                    </li>
                  )}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function ReviewList({ reviews, total }: { reviews: ReviewPage; total: number }) {
  const max = Math.max(1, ...Object.values(reviews.histogram))
  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg leading-snug font-semibold">Reviews</h2>
        <p className="text-sm text-ink-600">
          Only customers who booked through Kaamico can review.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {total === 0 ? (
          <p className="text-ink-600">No reviews yet.</p>
        ) : (
          <>
            <dl className="flex flex-col gap-1.5">
              {([5, 4, 3, 2, 1] as const).map((star) => (
                <div key={star} className="flex items-center gap-3 text-sm">
                  <dt className="w-14 shrink-0">{star} star</dt>
                  <dd className="flex flex-1 items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted"
                    >
                      <span
                        className="block h-full rounded-full bg-accent-500"
                        style={{ width: `${(reviews.histogram[star] / max) * 100}%` }}
                      />
                    </span>
                    <span className="w-8 text-right tabular-nums">{reviews.histogram[star]}</span>
                  </dd>
                </div>
              ))}
            </dl>
            <ul className="flex flex-col divide-y divide-border">
              {reviews.items.map((r) => (
                <li key={r.id} className="flex flex-col gap-1.5 py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <RatingStars rating={r.rating} />
                    <span className="text-sm font-medium">{r.author}</span>
                    <span className="text-sm text-ink-600">
                      {r.serviceName} · {monthYear.format(new Date(r.createdAt))}
                    </span>
                  </div>
                  {r.comment && <p>{r.comment}</p>}
                  {r.tags.length > 0 && (
                    <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
                      {r.tags.map((t) => (
                        <li key={t}>
                          <Badge>{TAG_LABELS[t] ?? t}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                  {r.workerReply && (
                    <p className="rounded-md bg-surface-muted px-3 py-2 text-sm">
                      <span className="font-medium">Reply: </span>
                      {r.workerReply}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  )
}

/** Sticky on phones, a side card on desktop: starts the booking wizard for the chosen service. */
function BookPanel({ profile, serviceId }: { profile: PublicProfile; serviceId?: string }) {
  const service = profile.services.find((s) => s.serviceId === serviceId) ?? profile.services[0]
  return (
    <div className="fixed inset-x-0 bottom-16 z-30 border-t border-border bg-surface px-4 py-3 shadow-lg md:static md:rounded-lg md:border md:p-5 md:shadow-xs">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-3 md:flex-col md:items-stretch">
        {service && (
          <p className="flex min-w-0 flex-col">
            <span className="truncate text-sm text-ink-600">{service.name}</span>
            <span>
              <Money paise={service.pricePaise} className="text-lg font-bold" />{' '}
              <span className="text-sm text-ink-600">{unitSuffix(service.unit)}</span>
            </span>
          </p>
        )}
        {service && (
          <div className="flex flex-col items-end gap-1 md:items-stretch">
            <Button asChild>
              <Link href={`/book/${service.serviceId}?worker=${profile.workerId}`}>
                Request booking
              </Link>
            </Button>
            <span className="text-xs text-ink-600">No payment now. You can suggest a price.</span>
          </div>
        )}
      </div>
    </div>
  )
}

async function ProfileContent({ params, searchParams }: Props) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const serviceId = typeof query.service === 'string' ? query.service : undefined
  const profile = await loadProfile(id)
  const offered = profile.services.some((s) => s.serviceId === serviceId) ? serviceId : undefined
  const reviews = await getPublicReviews(profile.workerId, { limit: 10 })
  const reviewTotal = Object.values(reviews.histogram).reduce((a, b) => a + b, 0)
  const backHref = offered ? `/search?service=${offered}` : '/search'

  return (
    <div className="flex flex-col gap-6 pb-28 md:pb-0">
      <Link
        href={backHref}
        className="inline-flex h-11 w-fit items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        Back to results
      </Link>
      <ProfileHeader profile={profile} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          {profile.bio && (
            <section aria-labelledby="about-title" className="flex flex-col gap-2">
              <h2 id="about-title" className="text-lg font-semibold">
                About
              </h2>
              <p className="max-w-prose text-ink-900">{profile.bio}</p>
              <p className="text-sm text-ink-600">
                On Kaamico since {monthYear.format(new Date(profile.memberSince))}
              </p>
            </section>
          )}
          <ServicePriceList profile={profile} highlight={offered} />
          <ReviewList reviews={reviews} total={reviewTotal} />
        </div>
        <aside className="flex flex-col gap-6 lg:sticky lg:top-20" aria-label="Booking">
          <BookPanel profile={profile} serviceId={offered} />
          <Suspense fallback={<Skeleton className="h-40" />}>
            <AvailabilityPreview workerId={profile.workerId} serviceId={offered} />
          </Suspense>
        </aside>
      </div>
    </div>
  )
}

function ProfileSkeleton() {
  return (
    <div
      className="flex flex-col gap-6"
      role="status"
      aria-busy="true"
      aria-label="Loading profile"
    >
      <Skeleton className="h-6 w-32" />
      <div className="flex gap-4">
        <Skeleton className="size-20 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-5 w-72 max-w-full" />
        </div>
      </div>
      <Skeleton className="h-64" />
    </div>
  )
}

export default function ProfessionalPage(props: Props) {
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <ProfileContent {...props} />
    </Suspense>
  )
}
