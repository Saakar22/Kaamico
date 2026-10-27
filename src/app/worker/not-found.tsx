import { RouteNotFound } from '@/components/patterns/route-not-found'

export default function NotFound() {
  return (
    <RouteNotFound
      description="This request or job may have been cancelled, or belongs to someone else."
      homeHref="/worker/dashboard"
      homeLabel="Go to dashboard"
    />
  )
}
