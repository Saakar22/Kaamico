import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isDevPagesEnabled } from '@/config/flags'

export const metadata: Metadata = { robots: { index: false, follow: false } }

export default function DevLayout({ children }: LayoutProps<'/dev'>) {
  if (!isDevPagesEnabled()) notFound()
  return children
}
