import type { Metadata } from 'next'
import { ServiceAreaForm } from '@/components/domain/worker/service-area-form'
import { TimeOffManager } from '@/components/domain/worker/time-off-manager'
import { WeeklyHoursEditor } from '@/components/domain/worker/weekly-hours-editor'
import { PageHeader } from '@/components/patterns/page-header'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { getWeeklyRules, listTimeOff } from '@/modules/availability/schedule'
import { listLocalities } from '@/modules/location/localities'
import { requireWorkerPage } from '@/modules/workers/page-guard'
import { getOwnProfile } from '@/modules/workers/profile'

export const instant = false

export const metadata: Metadata = { title: 'Hours and work area' }

export default async function WorkerAvailabilityPage() {
  const actor = await requireWorkerPage()
  const [profile, localities, rules, timeOff] = await Promise.all([
    getOwnProfile(actor.workerId),
    listLocalities(),
    getWeeklyRules(actor.workerId),
    listTimeOff(actor.workerId),
  ])
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Hours and work area"
        description="Customers can only book you inside your hours and within your travel distance. Times are in IST."
      />
      <Card id="area" className="scroll-mt-20">
        <CardHeader>
          <h2 className="text-lg font-semibold">Where you work</h2>
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
          <h2 className="text-lg font-semibold">Weekly hours</h2>
          <p className="text-sm text-ink-600">
            Up to 3 time windows a day, for example a lunch break.
          </p>
        </CardHeader>
        <CardContent>
          <WeeklyHoursEditor initial={rules} />
        </CardContent>
      </Card>
      <Card id="time-off" className="scroll-mt-20">
        <CardHeader>
          <h2 className="text-lg font-semibold">Time off</h2>
          <p className="text-sm text-ink-600">
            Block days you can&apos;t work. Time off can&apos;t overlap a job you have already
            confirmed.
          </p>
        </CardHeader>
        <CardContent>
          <TimeOffManager initial={timeOff} />
        </CardContent>
      </Card>
    </div>
  )
}
