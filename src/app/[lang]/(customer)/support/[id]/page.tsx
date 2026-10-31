import type { Metadata } from 'next'
import { SupportThread } from '@/components/domain/support/support-pages'
import { requirePageActor } from '@/modules/auth/page-guards'

export const instant = false

export const metadata: Metadata = { title: 'Help request' }

export default async function Page({ params }: PageProps<'/[lang]/support/[id]'>) {
  const actor = await requirePageActor('CUSTOMER')
  return <SupportThread actor={actor} basePath="/support" ticketId={(await params).id} />
}
