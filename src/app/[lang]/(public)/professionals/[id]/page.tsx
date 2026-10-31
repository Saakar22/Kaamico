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
import { FavoriteSlot } from '@/components/domain/professionals/favorite-slot'
import { RatingStars, RatingSummary } from '@/components/domain/professionals/rating'
import { VerificationBadge } from '@/components/domain/trust-badges'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RateList, RateRow } from '@/components/patterns/rate-list'
import { Money } from '@/components/ui/money'
import { Skeleton } from '@/components/ui/skeleton'
import { htmlLang, type Locale } from '@/i18n/config'
import { getLocale, getT } from '@/i18n/server'
import { AppError } from '@/lib/errors'
import { cn } from '@/lib/cn'
import { formatIstDay, formatIstTime, istDateKey } from '@/lib/time'
import { formatDuration, unitSpoken, unitSuffix } from '@/modules/catalog/units'
import { languageNames } from '@/modules/professionals/languages'
import { reviewTagLabel } from '@/modules/reviews/tags'
import {
  getAvailability,
  getPublicProfile,
  getPublicReviews,
  type PublicProfile,
  type ReviewPage,
} from '@/modules/professionals/profile'

type Props = PageProps<'/[lang]/professionals/[id]'>

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('profile.metaTitle') }
}

const PREVIEW_DAYS = 3
const PREVIEW_TIMES = 4

const monthYear = (locale: Locale, date: Date) =>
  new Intl.DateTimeFormat(htmlLang[locale], { month: 'long', year: 'numeric' }).format(date)
const fullDate = (locale: Locale, date: Date) =>
  new Intl.DateTimeFormat(htmlLang[locale], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(date)

async function loadProfile(id: string, locale: Locale): Promise<PublicProfile> {
  try {
    return await getPublicProfile(id, locale)
  } catch (error) {
    // Unverified, suspended and unknown professionals all look the same: not found.
    if (error instanceof AppError && error.status === 404) notFound()
    throw error
  }
}

async function ProfileHeader({ profile }: { profile: PublicProfile }) {
  const [t, locale] = await Promise.all([getT(), getLocale()])
  return (
    <header className="flex items-start gap-4">
      <Avatar
        name={profile.displayName}
        src={profile.photoUrl}
        size="lg"
        className="size-14 text-base sm:size-20 sm:text-xl"
      />
      <div className="flex min-w-0 flex-col gap-2">
        <h1 className="font-display text-4xl leading-none font-semibold sm:text-5xl">
          {profile.displayName}
        </h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <VerificationBadge status="VERIFIED" />
          {profile.isNew && (
            <Badge tone="info">
              <Sprout aria-hidden="true" />
              {t('badges.newOnKaamico')}
            </Badge>
          )}
          <RatingSummary avg={profile.rating.avg} count={profile.rating.count} />
        </div>
        {profile.verifiedOn && (
          <p className="text-sm text-ink-600">
            {t('profile.idCheckedOn', { date: fullDate(locale, new Date(profile.verifiedOn)) })}
          </p>
        )}
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-600">
          <li className="flex items-center gap-1.5">
            <BriefcaseBusiness aria-hidden="true" className="size-4" />
            {t('proCard.jobsDone', { count: profile.completedJobs })}
            {profile.yearsExperience > 0 && (
              <> · {t('proCard.yearsExperience', { count: profile.yearsExperience })}</>
            )}
          </li>
          {profile.languages.length > 0 && (
            <li className="flex items-center gap-1.5">
              <Languages aria-hidden="true" className="size-4" />
              {t('proCard.speaks', {
                languages: languageNames(profile.languages, htmlLang[locale]),
              })}
            </li>
          )}
          {profile.city && (
            <li className="flex items-center gap-1.5">
              <MapPin aria-hidden="true" className="size-4" />
              {t('profile.worksIn', { city: profile.city })}
            </li>
          )}
        </ul>
        <Suspense fallback={null}>
          <FavoriteSlot workerId={profile.workerId} name={profile.displayName} />
        </Suspense>
      </div>
    </header>
  )
}

async function ServicePriceList({
  profile,
  highlight,
}: {
  profile: PublicProfile
  highlight?: string
}) {
  const [t, locale] = await Promise.all([getT(), getLocale()])
  const firstName = profile.displayName.split(' ')[0]
  return (
    <section aria-labelledby="prices-title" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="prices-title" className="font-display text-2xl font-semibold">
          {t('profile.servicesAndPrices')}
        </h2>
        <p className="text-sm text-ink-600">{t('profile.pricesSetBy', { name: firstName })}</p>
      </div>
      <RateList>
        {profile.services.map((s) => (
          <RateRow
            key={s.serviceId}
            className={cn(
              s.serviceId === highlight &&
                'relative -mx-3 rounded-sm bg-brand-50 px-3 before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:bg-brand-600',
            )}
            label={s.name}
            detail={
              <>
                {s.category.name} ·{' '}
                {t('profile.about', { duration: formatDuration(s.typicalDurationMin, locale) })}
              </>
            }
            price={
              <>
                <Money paise={s.pricePaise} />{' '}
                <span className="font-sans text-sm font-normal text-ink-600" aria-hidden="true">
                  {unitSuffix(s.unit, locale)}
                </span>
                <span className="sr-only">{unitSpoken(s.unit, locale)}</span>
              </>
            }
            priceNote={
              <>
                {s.negotiable ? t('proCard.openToOffers') : t('proCard.fixedPrice')}
                {s.minChargePaise > 0 && (
                  <>
                    {' · '}
                    {t('profile.minimum')} <Money paise={s.minChargePaise} />
                  </>
                )}
              </>
            }
          />
        ))}
      </RateList>
    </section>
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
  const [t, locale] = await Promise.all([getT(), getLocale()])
  const lang = htmlLang[locale]
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
    <section
      aria-labelledby="free-title"
      className="flex flex-col gap-3 border-t border-border pt-5"
    >
      <h2 id="free-title" className="font-display text-xl font-semibold">
        {t('profile.upcomingFree')}
      </h2>
      <div>
        {withSlots.length === 0 ? (
          <p className="text-ink-600">{t('profile.noFreeTimes', { days: PREVIEW_DAYS })}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {withSlots.map((d) => (
              <li key={d.date} className="flex flex-col gap-1.5">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <CalendarClock aria-hidden="true" className="size-4 text-ink-600" />
                  {formatIstDay(new Date(d.slots[0].start), now, lang)}
                </span>
                <ul className="flex flex-wrap gap-2" aria-label={t('profile.startTimes')}>
                  {d.slots.slice(0, PREVIEW_TIMES).map((s) => (
                    <li
                      key={s.start}
                      className="rounded-sm border border-border px-2.5 py-1 text-sm tabular-nums"
                    >
                      {formatIstTime(new Date(s.start), lang)}
                    </li>
                  ))}
                  {d.slots.length > PREVIEW_TIMES && (
                    <li className="px-1 py-1 text-sm text-ink-600">
                      {t('profile.more', { count: d.slots.length - PREVIEW_TIMES })}
                    </li>
                  )}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

async function ReviewList({ reviews, total }: { reviews: ReviewPage; total: number }) {
  const [t, locale] = await Promise.all([getT(), getLocale()])
  const max = Math.max(1, ...Object.values(reviews.histogram))
  return (
    <section aria-labelledby="reviews-title" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 id="reviews-title" className="font-display text-2xl font-semibold">
          {t('profile.reviews')}
        </h2>
        <p className="text-sm text-ink-600">{t('profile.reviewsNote')}</p>
      </div>
      <div className="flex flex-col gap-5">
        {total === 0 ? (
          <p className="text-ink-600">{t('profile.noReviews')}</p>
        ) : (
          <>
            <dl className="flex max-w-md flex-col gap-1.5">
              {([5, 4, 3, 2, 1] as const).map((star) => (
                <div key={star} className="flex items-center gap-3 text-sm">
                  <dt className="w-14 shrink-0">{t('profile.starRow', { star })}</dt>
                  <dd className="flex flex-1 items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="h-1.5 flex-1 overflow-hidden rounded-sm bg-surface-muted"
                    >
                      <span
                        className="block h-full rounded-sm bg-accent-500"
                        style={{ width: `${(reviews.histogram[star] / max) * 100}%` }}
                      />
                    </span>
                    <span className="w-8 text-right tabular-nums">{reviews.histogram[star]}</span>
                  </dd>
                </div>
              ))}
            </dl>
            <ul className="flex flex-col divide-y divide-border border-t border-border">
              {reviews.items.map((r) => (
                <li key={r.id} className="flex flex-col gap-1.5 py-4">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <RatingStars rating={r.rating} />
                    <span className="text-sm font-medium">{r.author}</span>
                    <span className="text-sm text-ink-600">
                      {r.serviceName} · {monthYear(locale, new Date(r.createdAt))}
                    </span>
                  </div>
                  {r.comment && <p className="max-w-prose">{r.comment}</p>}
                  {r.tags.length > 0 && (
                    <ul className="flex flex-wrap gap-1.5" aria-label={t('profile.tags')}>
                      {r.tags.map((tag) => (
                        <li key={tag}>
                          <Badge>{reviewTagLabel(tag, locale)}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                  {r.workerReply && (
                    <p className="max-w-prose border-l-2 border-brand-600 py-1 pl-3 text-sm">
                      <span className="font-medium">{t('profile.reply')}</span>
                      {r.workerReply}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  )
}

/** Sticky on phones, a side card on desktop: starts the booking wizard for the chosen service. */
async function BookPanel({ profile, serviceId }: { profile: PublicProfile; serviceId?: string }) {
  const [t, locale] = await Promise.all([getT(), getLocale()])
  const service = profile.services.find((s) => s.serviceId === serviceId) ?? profile.services[0]
  return (
    <div className="fixed inset-x-0 bottom-16 z-30 border-t border-border bg-surface px-4 py-3 shadow-[0_-4px_16px_rgb(0_0_0/0.06)] md:static md:rounded-md md:border md:p-5 md:shadow-none">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-3 md:flex-col md:items-stretch">
        {service && (
          <p className="flex min-w-0 flex-col">
            <span className="truncate text-sm text-ink-600">{service.name}</span>
            <span>
              <Money
                paise={service.pricePaise}
                className="font-display text-2xl font-semibold md:text-3xl"
              />{' '}
              <span className="text-sm text-ink-600">{unitSuffix(service.unit, locale)}</span>
            </span>
          </p>
        )}
        {service && (
          <div className="flex flex-col items-end gap-1 md:items-stretch">
            <Button asChild>
              <Link href={`/book/${service.serviceId}?worker=${profile.workerId}`}>
                {t('profile.requestBooking')}
              </Link>
            </Button>
            <span className="text-xs text-ink-600">{t('profile.noPaymentNow')}</span>
          </div>
        )}
      </div>
    </div>
  )
}

async function ProfileContent({ params, searchParams }: Props) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const serviceId = typeof query.service === 'string' ? query.service : undefined
  const [t, locale] = await Promise.all([getT(), getLocale()])
  const profile = await loadProfile(id, locale)
  const offered = profile.services.some((s) => s.serviceId === serviceId) ? serviceId : undefined
  const reviews = await getPublicReviews(profile.workerId, { limit: 10 }, locale)
  const reviewTotal = Object.values(reviews.histogram).reduce((a, b) => a + b, 0)
  const backHref = offered ? `/search?service=${offered}` : '/search'

  return (
    <div className="flex flex-col gap-6 pb-28 md:pb-0">
      <Link
        href={backHref}
        className="inline-flex h-11 w-fit items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        {t('profile.backToResults')}
      </Link>
      <ProfileHeader profile={profile} />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-16">
        <div className="flex min-w-0 flex-col gap-12">
          {profile.bio && (
            <section aria-labelledby="about-title" className="flex flex-col gap-2">
              <h2 id="about-title" className="font-display text-2xl font-semibold">
                {t('profile.aboutTitle')}
              </h2>
              <p className="max-w-prose text-ink-900">{profile.bio}</p>
              <p className="text-sm text-ink-600">
                {t('profile.since', { date: monthYear(locale, new Date(profile.memberSince)) })}
              </p>
            </section>
          )}
          <ServicePriceList profile={profile} highlight={offered} />
          <ReviewList reviews={reviews} total={reviewTotal} />
        </div>
        <aside
          className="flex flex-col gap-6 lg:sticky lg:top-20"
          aria-label={t('profile.booking')}
        >
          <BookPanel profile={profile} serviceId={offered} />
          <Suspense fallback={<Skeleton className="h-40" />}>
            <AvailabilityPreview workerId={profile.workerId} serviceId={offered} />
          </Suspense>
        </aside>
      </div>
    </div>
  )
}

async function ProfileSkeleton() {
  const t = await getT()
  return (
    <div
      className="flex flex-col gap-6"
      role="status"
      aria-busy="true"
      aria-label={t('profile.loading')}
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
