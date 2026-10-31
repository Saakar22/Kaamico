import type { Metadata } from 'next'
import { SupportHome } from '@/components/domain/support/support-pages'
import { requirePageActor } from '@/modules/auth/page-guards'

export const instant = false

export const metadata: Metadata = { title: 'Help and support' }

export default async function Page({ searchParams }: PageProps<'/[lang]/support'>) {
  const actor = await requirePageActor('CUSTOMER')
  const { booking } = await searchParams
  return (
    <SupportHome
      actor={actor}
      basePath="/support"
      bookingId={typeof booking === 'string' ? booking : undefined}
    />
  )
}
