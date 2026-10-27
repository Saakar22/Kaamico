import { MapPinOff, Zap } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { QuickMatchForm } from '@/components/domain/booking/quick-match-form'
import { PageHeader } from '@/components/patterns/page-header'
import { EmptyState } from '@/components/patterns/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { listAddresses } from '@/modules/addresses/addresses'
import { requirePageActor } from '@/modules/auth/page-guards'
import { getService } from '@/modules/catalog/catalog'

export const instant = false

export const metadata: Metadata = { title: 'Quick match' }

/** "Quick match": one request to up to five nearby professionals who are free now. */
export default async function QuickMatchPage({ params }: PageProps<'/book/[serviceId]/quick'>) {
  const actor = await requirePageActor('CUSTOMER')
  const { serviceId } = await params
  const service = await getService(serviceId)
  if (!service) notFound()
  const addresses = await listAddresses(actor.userId)

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader
        title={`Quick match: ${service.name}`}
        description="We send your request to up to five nearby professionals who are free right now, each at their own listed price. The first to accept is booked, and you see who it is straight away."
      />
      <Card>
        <CardContent className="flex flex-col gap-4">
          <p className="flex items-center gap-2 text-sm text-ink-600">
            <Zap aria-hidden="true" className="size-4 text-accent-500" />
            For a job now. To pick a time or a professional yourself, compare them instead.
          </p>
          {addresses.length === 0 ? (
            <EmptyState
              icon={MapPinOff}
              title="Add an address first"
              description="Book once by choosing a professional and we will save your address for quick matches."
              action={
                <Button asChild>
                  <Link href={`/search?service=${service.id}`}>Compare professionals</Link>
                </Button>
              }
            />
          ) : (
            <QuickMatchForm serviceId={service.id} addresses={addresses} />
          )}
        </CardContent>
      </Card>
      <Link
        href={`/search?service=${service.id}`}
        className="inline-flex h-11 w-fit items-center text-sm font-medium text-brand-700 hover:underline"
      >
        Compare professionals instead
      </Link>
    </div>
  )
}
