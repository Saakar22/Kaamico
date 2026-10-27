import { RouteNotFound } from '@/components/patterns/route-not-found'

export default function NotFound() {
  return <RouteNotFound homeHref="/admin" homeLabel="Go to overview" />
}
