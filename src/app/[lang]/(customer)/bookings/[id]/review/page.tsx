import { ChevronLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ReviewForm } from '@/components/domain/reviews/review-form'
import { PageHeader } from '@/components/patterns/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { type Locale } from '@/i18n/config'
import { getLocale, getT } from '@/i18n/server'
import { AppError } from '@/lib/errors'
import { requirePageActor } from '@/modules/auth/page-guards'
import type { Actor } from '@/modules/auth/types'
import { getCustomerBooking } from '@/modules/bookings/views'
import { reviewState } from '@/modules/reviews/reviews'

export const instant = false

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('review.metaTitle') }
}

async function load(actor: Actor, id: string, locale: Locale) {
  try {
    return await Promise.all([
      getCustomerBooking(actor, id, new Date(), locale),
      reviewState(actor, id),
    ])
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound()
    throw error
  }
}

export default async function ReviewPage({ params }: PageProps<'/[lang]/bookings/[id]/review'>) {
  const actor = await requirePageActor('CUSTOMER')
  const [t, locale] = await Promise.all([getT(), getLocale()])
  const [booking, state] = await load(actor, (await params).id, locale)
  const firstName = booking.worker.displayName.split(' ')[0]

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Link
        href={`/bookings/${booking.id}`}
        className="inline-flex h-11 w-fit items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        {t('review.back')}
      </Link>
      <PageHeader
        title={t('review.title', { name: firstName })}
        description={`${booking.service.name} · ${booking.code}`}
      />
      <Card>
        <CardContent>
          {state.canReview ? (
            <ReviewForm bookingId={booking.id} workerName={firstName} />
          ) : (
            <p role="status">
              {state.review
                ? t('review.already')
                : booking.status !== 'COMPLETED'
                  ? t('review.notYet')
                  : t('review.tooLate')}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
