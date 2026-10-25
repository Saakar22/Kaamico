import { PageSkeleton } from '@/components/patterns/page-skeleton'

// Gives each page its own Suspense boundary, so session reads stream in on navigation.
export default function Loading() {
  return <PageSkeleton />
}
