import type { Metadata } from 'next'
import { SupportHome } from '@/components/domain/support/support-pages'
import { requireWorkerPage } from '@/modules/workers/page-guard'

export const instant = false

export const metadata: Metadata = { title: 'Help and support' }

export default async function Page({ searchParams }: PageProps<'/worker/support'>) {
  const actor = await requireWorkerPage()
  const { booking } = await searchParams
  return (
    <SupportHome
      actor={actor}
      basePath="/worker/support"
      bookingId={typeof booking === 'string' ? booking : undefined}
    />
  )
}
