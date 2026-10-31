import { MapPinOff, Zap } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { QuickMatchForm } from '@/components/domain/booking/quick-match-form'
import { PageHeader } from '@/components/patterns/page-header'
import { EmptyState } from '@/components/patterns/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { getLocale, getT } from '@/i18n/server'
import { listAddresses } from '@/modules/addresses/addresses'
import { requirePageActor } from '@/modules/auth/page-guards'
import { getService } from '@/modules/catalog/catalog'

export const instant = false

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('quick.metaTitle') }
}

/** "Quick match": one request to up to five nearby professionals who are free now. */
export default async function QuickMatchPage({
  params,
}: PageProps<'/[lang]/book/[serviceId]/quick'>) {
  const actor = await requirePageActor('CUSTOMER')
  const { serviceId } = await params
  const [t, locale] = await Promise.all([getT(), getLocale()])
  const service = await getService(serviceId, locale)
  if (!service) notFound()
  const addresses = await listAddresses(actor.userId)

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader
        title={t('quick.title', { service: service.name })}
        description={t('quick.description')}
      />
      <Card>
        <CardContent className="flex flex-col gap-4">
          <p className="flex items-center gap-2 text-sm text-ink-600">
            <Zap aria-hidden="true" className="size-4 text-accent-500" />
            {t('quick.forNow')}
          </p>
          {addresses.length === 0 ? (
            <EmptyState
              icon={MapPinOff}
              title={t('quick.addAddressTitle')}
              description={t('quick.addAddressBody')}
              action={
                <Button asChild>
                  <Link href={`/search?service=${service.id}`}>{t('quick.compare')}</Link>
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
        {t('quick.compareInstead')}
      </Link>
    </div>
  )
}
