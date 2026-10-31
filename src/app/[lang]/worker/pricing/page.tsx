import { Wrench } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { PricingEditor } from '@/components/domain/worker/pricing-editor'
import { PageHeader } from '@/components/patterns/page-header'
import { EmptyState } from '@/components/patterns/states'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { getEnv } from '@/config/env'
import { requireWorkerPage } from '@/modules/workers/page-guard'
import { getPricing } from '@/modules/workers/pricing'

export const instant = false

export const metadata: Metadata = { title: 'Your prices' }

export default async function WorkerPricingPage() {
  const actor = await requireWorkerPage()
  const rows = await getPricing(actor.workerId)
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Your prices"
        description="You decide what to charge. Customers see your price and can accept it or, if you are open to offers, suggest another."
      />
      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={Wrench}
            title="Add your skills first"
            description="Choose the kinds of work you do, then set a price for each service."
            action={
              <Button asChild>
                <Link href="/worker/profile#skills">Choose skills</Link>
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
