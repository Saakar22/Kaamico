import { ChevronLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ReviewForm } from '@/components/domain/reviews/review-form'
import { PageHeader } from '@/components/patterns/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { AppError } from '@/lib/errors'
import { requirePageActor } from '@/modules/auth/page-guards'
import type { Actor } from '@/modules/auth/types'
import { getCustomerBooking } from '@/modules/bookings/views'
import { reviewState } from '@/modules/reviews/reviews'

export const instant = false

export const metadata: Metadata = { title: 'Rate your professional' }

async function load(actor: Actor, id: string) {
  try {
    return await Promise.all([getCustomerBooking(actor, id), reviewState(actor, id)])
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound()
    throw error
  }
}

export default async function ReviewPage({ params }: PageProps<'/[lang]/bookings/[id]/review'>) {
  const actor = await requirePageActor('CUSTOMER')
  const [booking, state] = await load(actor, (await params).id)
  const firstName = booking.worker.displayName.split(' ')[0]

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Link
        href={`/bookings/${booking.id}`}
        className="inline-flex h-11 w-fit items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        Back to booking
      </Link>
      <PageHeader
        title={`Rate ${firstName}`}
        description={`${booking.service.name} · ${booking.code}`}
      />
      <Card>
        <CardContent>
          {state.canReview ? (
            <ReviewForm bookingId={booking.id} workerName={firstName} />
          ) : (
            <p role="status">
              {state.review
                ? 'You have already reviewed this job. Thank you!'
                : booking.status !== 'COMPLETED'
                  ? 'You can review the job once it is completed.'
                  : 'Reviews can be left up to 14 days after the job, and that time has passed.'}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
