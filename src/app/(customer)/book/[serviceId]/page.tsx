import { SearchX } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BookingWizard } from '@/components/domain/booking/booking-wizard'
import { PageHeader } from '@/components/patterns/page-header'
import { EmptyState } from '@/components/patterns/states'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { AppError } from '@/lib/errors'
import { formatIstDay, istDateKey } from '@/lib/time'
import { listAddresses } from '@/modules/addresses/addresses'
import { requirePageActor } from '@/modules/auth/page-guards'
import { workerAvailableNow } from '@/modules/bookings/eligibility'
import { getService } from '@/modules/catalog/catalog'
import { listLocalities } from '@/modules/location/localities'
import { getPublicProfile } from '@/modules/professionals/profile'

export const instant = false

export const metadata: Metadata = { title: 'Book a professional' }

const DAYS_AHEAD = 7

export default async function BookPage({ params, searchParams }: PageProps<'/book/[serviceId]'>) {
  const actor = await requirePageActor('CUSTOMER')
  const [{ serviceId }, query] = await Promise.all([params, searchParams])
  const workerId = typeof query.worker === 'string' ? query.worker : null
  const service = await getService(serviceId)
  if (!service || !workerId) notFound()

  let profile
  try {
    profile = await getPublicProfile(workerId)
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound()
    throw error
  }
  const offered = profile.services.find((s) => s.serviceId === service.id)
  if (!offered) {
    return (
      <Card>
        <EmptyState
          icon={SearchX}
          title={`${profile.displayName} does not offer ${service.name}`}
          action={
            <Button asChild>
              <Link href={`/search?service=${service.id}`}>See other professionals</Link>
            </Button>
          }
        />
      </Card>
    )
  }

  const now = new Date()
  const [addresses, localities, availableNow] = await Promise.all([
    listAddresses(actor.userId),
    listLocalities(),
    workerAvailableNow(workerId, service.typicalDurationMin, now),
  ])
  const days = Array.from({ length: DAYS_AHEAD }, (_, i) => {
    const d = new Date(now.getTime() + i * 86_400_000)
    return { date: istDateKey(d), label: formatIstDay(d, now) }
  })

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader
        title={`Book ${service.name}`}
        description={`Your request goes to ${profile.displayName}, who confirms it.`}
      />
      <BookingWizard
        service={{
          id: service.id,
          name: service.name,
          unit: offered.unit,
          durationMin: service.typicalDurationMin,
        }}
        worker={{ id: profile.workerId, name: profile.displayName, photoUrl: profile.photoUrl }}
        price={{
          listedPaise: offered.pricePaise,
          minChargePaise: offered.minChargePaise,
          negotiable: offered.negotiable,
        }}
        addresses={addresses}
        localities={localities.map((l) => ({
          id: l.id,
          city: l.city,
          name: l.name,
          pincode: l.pincode,
        }))}
        availableNow={availableNow}
        days={days}
      />
    </div>
  )
}
