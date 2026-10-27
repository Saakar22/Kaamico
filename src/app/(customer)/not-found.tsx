import { RouteNotFound } from '@/components/patterns/route-not-found'

export default function NotFound() {
  return (
    <RouteNotFound
      description="It may have been removed or belong to another account, or the link may be wrong."
      homeHref="/dashboard"
      homeLabel="Go to dashboard"
    />
  )
}
