import type { Metadata } from 'next'
import { SupportThread } from '@/components/domain/support/support-pages'
import { requireWorkerPage } from '@/modules/workers/page-guard'

export const instant = false

export const metadata: Metadata = { title: 'Help request' }

export default async function Page({ params }: PageProps<'/[lang]/worker/support/[id]'>) {
  const actor = await requireWorkerPage()
  return <SupportThread actor={actor} basePath="/worker/support" ticketId={(await params).id} />
}
