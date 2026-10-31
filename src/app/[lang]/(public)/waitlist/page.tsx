import type { Metadata } from 'next'
import { Suspense } from 'react'
import { WaitlistForm } from '@/components/domain/location/waitlist-form'
import { PageHeader } from '@/components/patterns/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { getLocale, getT } from '@/i18n/server'
import { listCategories } from '@/modules/catalog/catalog'

export async function generateMetadata(): Promise<Metadata> {
  // A form, not content to index.
  return { title: (await getT())('waitlist.metaTitle'), robots: { index: false } }
}

const coordinate = (value: string | string[] | undefined, max: number) => {
  const n = Number(Array.isArray(value) ? value[0] : value)
  return Number.isFinite(n) && Math.abs(n) <= max ? n : null
}

async function Form({
  searchParams,
}: {
  searchParams: PageProps<'/[lang]/waitlist'>['searchParams']
}) {
  const query = await searchParams
  const lat = coordinate(query.lat, 90)
  const lng = coordinate(query.lng, 180)
  const categories = await listCategories(await getLocale())
  return (
    <WaitlistForm
      categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      point={lat !== null && lng !== null ? { lat, lng } : null}
    />
  )
}

/** For people outside the service cities: hear when Kaamico arrives (§4.2, P2). */
export default async function WaitlistPage(props: PageProps<'/[lang]/waitlist'>) {
  const t = await getT()
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <PageHeader title={t('waitlist.title')} description={t('waitlist.description')} />
      <Card>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-72" />}>
            <Form searchParams={props.searchParams} />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  )
}
