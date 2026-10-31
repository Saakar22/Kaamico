import type { Metadata } from 'next'
import { ServiceAreaForm } from '@/components/domain/worker/service-area-form'
import { TimeOffManager } from '@/components/domain/worker/time-off-manager'
import { WeeklyHoursEditor } from '@/components/domain/worker/weekly-hours-editor'
import { PageHeader } from '@/components/patterns/page-header'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { getWeeklyRules, listTimeOff } from '@/modules/availability/schedule'
import { getT } from '@/i18n/server'
import { listLocalities } from '@/modules/location/localities'
import { requireWorkerPage } from '@/modules/workers/page-guard'
import { getOwnProfile } from '@/modules/workers/profile'

export const instant = false

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('whours.metaTitle') }
}

export default async function WorkerAvailabilityPage() {
  const actor = await requireWorkerPage()
  const t = await getT()
  const [profile, localities, rules, timeOff] = await Promise.all([
    getOwnProfile(actor.workerId),
    listLocalities(),
    getWeeklyRules(actor.workerId),
    listTimeOff(actor.workerId),
  ])
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('whours.title')} description={t('whours.description')} />
      <Card id="area" className="scroll-mt-20">
        <CardHeader>
          <h2 className="text-lg font-semibold">{t('whours.whereTitle')}</h2>
        </CardHeader>
        <CardContent>
          <ServiceAreaForm
            localities={localities.map((l) => ({ id: l.id, city: l.city, name: l.name }))}
            initial={
              profile.serviceArea
                ? {
                    localityId: profile.serviceArea.locality?.id ?? null,
                    radiusKm: profile.serviceArea.radiusKm,
                  }
                : null
            }
          />
        </CardContent>
      </Card>
      <Card id="hours" className="scroll-mt-20">
        <CardHeader>
          <h2 className="text-lg font-semibold">{t('whours.hoursTitle')}</h2>
          <p className="text-sm text-ink-600">{t('whours.hoursHint')}</p>
        </CardHeader>
        <CardContent>
          <WeeklyHoursEditor initial={rules} />
        </CardContent>
      </Card>
      <Card id="time-off" className="scroll-mt-20">
        <CardHeader>
          <h2 className="text-lg font-semibold">{t('whours.timeOffTitle')}</h2>
          <p className="text-sm text-ink-600">{t('whours.timeOffHint')}</p>
        </CardHeader>
        <CardContent>
          <TimeOffManager initial={timeOff} />
        </CardContent>
      </Card>
    </div>
  )
}
