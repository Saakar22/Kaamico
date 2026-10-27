import { RouteNotFound } from '@/components/patterns/route-not-found'

export default function NotFound() {
  return (
    <RouteNotFound
      description="This professional or service may no longer be listed."
      homeHref="/services"
      homeLabel="Browse services"
    />
  )
}
