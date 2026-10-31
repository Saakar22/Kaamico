import type { Metadata } from 'next'
import Link from 'next/link'
import { SignOutButton } from '@/components/auth/sign-out-button'
import { statusBadgeLabel, statusTone } from '@/components/domain/negotiation/booking-status'
import { PageHeader } from '@/components/patterns/page-header'
import { StatTile } from '@/components/patterns/stat-tile'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { formatIstDateTime } from '@/lib/time'
import { listAdminBookings } from '@/modules/admin/bookings'
import { getAdminMetrics } from '@/modules/admin/metrics'
import { listVerificationQueue } from '@/modules/admin/verifications'
import { requirePageActor } from '@/modules/auth/page-guards'

// Session-dependent: always needs a server round trip, so opt out of instant validation.
export const instant = false

export const metadata: Metadata = { title: 'Admin overview' }

const tileLink = 'rounded-lg hover:ring-2 hover:ring-brand-600'

function waitingFor(since: string | null): string | undefined {
  if (!since) return undefined
  const hours = Math.round((Date.now() - new Date(since).getTime()) / 3_600_000)
  return hours < 24 ? `Oldest waiting ${hours} h` : `Oldest waiting ${Math.round(hours / 24)} days`
}

/** KPIs and the queues that need attention (§4.4 step 2). */
export default async function AdminOverviewPage() {
  const actor = await requirePageActor('ADMIN')
  const [metrics, queue, recent] = await Promise.all([
    getAdminMetrics(),
    listVerificationQueue('pending'),
    listAdminBookings({}),
  ])
  const cancelRate =
    metrics.bookings7d > 0 ? Math.round((metrics.cancellations7d / metrics.bookings7d) * 100) : 0

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Admin overview"
        description={`Signed in as ${actor.email ?? actor.name ?? 'admin'}. Admin sessions last 8 hours.`}
        actions={<SignOutButton redirectTo="/admin/login" />}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Link href="/admin/verifications" className={tileLink}>
          <StatTile
            label="Verifications to review"
            value={metrics.pendingVerifications}
            hint={waitingFor(metrics.oldestPendingAt)}
            className={metrics.pendingVerifications > 0 ? 'border-accent-500' : undefined}
          />
        </Link>
        <Link href="/admin/bookings?status=REQUESTED" className={tileLink}>
          <StatTile label="Open requests" value={metrics.openRequests} />
        </Link>
        <StatTile label="Jobs confirmed or under way" value={metrics.activeJobs} />
        <StatTile
          label="Bookings today"
          value={metrics.bookingsToday}
          hint={`${metrics.completedToday} completed today`}
        />
        <StatTile
          label="Cancellations (7 days)"
          value={metrics.cancellations7d}
          hint={`${cancelRate}% of ${metrics.bookings7d} bookings`}
        />
        <StatTile
          label="Median first reply (7 days)"
          value={
            metrics.medianResponseMinutes === null ? '–' : `${metrics.medianResponseMinutes} min`
          }
          hint="From request to the professional's first answer"
        />
        <Link href="/admin/users?status=SUSPENDED" className={tileLink}>
          <StatTile label="Suspended accounts" value={metrics.suspendedUsers} />
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="queue-title" className="flex flex-col gap-3">
          <div className="flex items-end justify-between gap-2">
            <h2 id="queue-title" className="font-display text-xl font-semibold">
              Waiting for review
            </h2>
            <Link
              href="/admin/verifications"
              className="text-sm font-medium text-brand-700 hover:underline"
            >
              Full queue
            </Link>
          </div>
          <Card>
            <CardContent className="p-0">
              {queue.items.length === 0 ? (
                <p className="p-4 text-ink-600">No applications are waiting.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {queue.items.slice(0, 5).map((a) => (
                    <li key={a.id}>
                      <Link
                        href={`/admin/verifications/${a.id}`}
                        className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-muted"
                      >
                        <span className="flex flex-col">
                          <span className="font-medium">{a.workerName}</span>
                          <span className="text-sm text-ink-600">
                            {[a.city, a.skills.join(', ')].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                        <span className="text-sm text-ink-600">
                          {a.submittedAt && formatIstDateTime(new Date(a.submittedAt))}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="recent-title" className="flex flex-col gap-3">
          <div className="flex items-end justify-between gap-2">
            <h2 id="recent-title" className="font-display text-xl font-semibold">
              Latest bookings
            </h2>
            <Link
              href="/admin/bookings"
              className="text-sm font-medium text-brand-700 hover:underline"
            >
              All bookings
            </Link>
          </div>
          <Card>
            <CardContent className="p-0">
              {recent.items.length === 0 ? (
                <p className="p-4 text-ink-600">No bookings yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {recent.items.slice(0, 5).map((b) => (
                    <li key={b.id}>
                      <Link
                        href={`/admin/bookings/${b.id}`}
                        className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-muted"
                      >
                        <span className="flex flex-col">
                          <span className="font-medium">
                            {b.serviceName} · {b.code}
                          </span>
                          <span className="text-sm text-ink-600">
                            {b.customerName} with {b.workerName}
                          </span>
                        </span>
                        <Badge tone={statusTone(b.status)}>{statusBadgeLabel(b.status)}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  )
}
