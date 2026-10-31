import { Wrench } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { PricingEditor } from '@/components/domain/worker/pricing-editor'
import { PageHeader } from '@/components/patterns/page-header'
import { EmptyState } from '@/components/patterns/states'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { getEnv } from '@/config/env'
import { getLocale, getT } from '@/i18n/server'
import { requireWorkerPage } from '@/modules/workers/page-guard'
import { getPricing } from '@/modules/workers/pricing'

export const instant = false

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('wpricing.metaTitle') }
}

export default async function WorkerPricingPage() {
  const actor = await requireWorkerPage()
  const [t, locale] = await Promise.all([getT(), getLocale()])
  const rows = await getPricing(actor.workerId, locale)
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('wpricing.title')} description={t('wpricing.description')} />
      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={Wrench}
            title={t('wpricing.skillsFirst')}
            description={t('wpricing.skillsFirstBody')}
            action={
              <Button asChild>
                <Link href="/worker/profile#skills">{t('wpricing.chooseSkills')}</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <PricingEditor rows={rows} commissionPercent={getEnv().COMMISSION_BPS / 100} />
      )}
    </div>
  )
}
