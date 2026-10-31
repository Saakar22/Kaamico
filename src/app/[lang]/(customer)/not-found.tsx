import { RouteNotFound } from '@/components/patterns/route-not-found'
import { getT } from '@/i18n/server'

export default async function NotFound() {
  const t = await getT()
  return (
    <RouteNotFound
      description={t('pages.customerMissing')}
      homeHref="/dashboard"
      homeLabel={t('pages.dashboard')}
    />
  )
}
