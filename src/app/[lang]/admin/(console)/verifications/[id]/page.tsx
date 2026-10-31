import { ChevronLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { DecisionForm } from '@/components/domain/admin/decision-form'
import { DocumentViewer } from '@/components/domain/admin/document-viewer'
import { PageHeader } from '@/components/patterns/page-header'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { AppError } from '@/lib/errors'
import { formatIstDateTime } from '@/lib/time'
import { getApplicationForAdmin } from '@/modules/admin/verifications'
import { requirePageActor } from '@/modules/auth/page-guards'

export const instant = false

export const metadata: Metadata = { title: 'Review application' }

const STATUS_LABEL: Record<string, string> = {
  SUBMITTED: 'Waiting for review',
  UNDER_REVIEW: 'Under review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  RESUBMISSION_REQUESTED: 'New documents requested',
  DRAFT: 'Draft',
}
const fmt = (at: string | null) => (at ? formatIstDateTime(new Date(at)) : '–')

async function load(id: string) {
  try {
    return await getApplicationForAdmin(id)
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound()
    throw error
  }
}

/** One application: who, what they uploaded, earlier attempts, and the decision (§4.4). */
export default async function ReviewApplicationPage({
  params,
}: PageProps<'/[lang]/admin/verifications/[id]'>) {
  await requirePageActor('ADMIN')
  const app = await load((await params).id)
  const w = app.worker

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/verifications"
        className="inline-flex h-11 w-fit items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        Verification queue
      </Link>
      <PageHeader
        title={w.displayName}
        description={`Attempt ${app.attempt} · ${STATUS_LABEL[app.status] ?? app.status} · submitted ${fmt(app.submittedAt)}`}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardContent>
              <DocumentViewer documents={app.documents} profilePhotoUrl={w.photoUrl} />
            </CardContent>
          </Card>

          {app.decidable ? (
            <Card>
              <CardContent>
                <DecisionForm
                  applicationId={app.id}
                  version={app.version}
                  workerName={w.displayName}
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-col gap-1" role="status">
                <p className="font-semibold">
                  {STATUS_LABEL[app.status]} {app.reviewerName ? `by ${app.reviewerName}` : ''} on{' '}
                  {fmt(app.reviewedAt)}
                </p>
                {app.decisionReason && <p className="text-ink-600">{app.decisionReason}</p>}
              </CardContent>
            </Card>
          )}

          <section aria-labelledby="trail-title" className="flex flex-col gap-3">
            <h2 id="trail-title" className="font-semibold">
              Audit trail
            </h2>
            {app.trail.length === 0 ? (
              <p className="text-sm text-ink-600">No admin has opened this application yet.</p>
            ) : (
              <ol className="flex flex-col gap-2 text-sm">
                {app.trail.map((t, i) => (
                  <li key={i} className="flex flex-wrap gap-x-2">
                    <span className="font-medium">
                      {t.action.replaceAll('_', ' ').toLowerCase()}
                    </span>
                    <span className="text-ink-600">
                      by {t.adminName} · {fmt(t.at)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-4" aria-label="Professional">
          <Card>
            <CardContent className="flex flex-col gap-4 text-sm">
              <div className="flex items-center gap-3">
                <Avatar name={w.displayName} src={w.photoUrl} />
                <div className="flex flex-col gap-1">
                  <span className="font-semibold">{w.displayName}</span>
                  <Badge tone={w.verificationStatus === 'VERIFIED' ? 'success' : 'neutral'}>
                    Worker status: {w.verificationStatus.toLowerCase()}
                  </Badge>
                </div>
              </div>
              {w.userStatus !== 'ACTIVE' && (
                <Badge tone="danger">Account {w.userStatus.toLowerCase()}</Badge>
              )}
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2">
                <dt className="text-ink-600">Phone</dt>
                <dd>{w.phone ?? '–'}</dd>
                <dt className="text-ink-600">Skills</dt>
                <dd>{w.skills.join(', ') || '–'}</dd>
                <dt className="text-ink-600">Area</dt>
                <dd>{w.area ? `${w.area} · ${w.radiusKm} km` : '–'}</dd>
                <dt className="text-ink-600">Experience</dt>
                <dd>{w.yearsExperience !== null ? `${w.yearsExperience} years` : '–'}</dd>
                <dt className="text-ink-600">Languages</dt>
                <dd>{w.languages.join(', ').toUpperCase() || '–'}</dd>
                <dt className="text-ink-600">Joined</dt>
                <dd>{fmt(w.joinedAt)}</dd>
              </dl>
              {w.bio && <p className="text-ink-900">“{w.bio}”</p>}
              <Link
                href={`/admin/users?q=${encodeURIComponent(w.phone ?? w.displayName)}`}
                className="font-medium text-brand-700 hover:underline"
              >
                Account and bookings
              </Link>
            </CardContent>
          </Card>
          {app.previous.length > 0 && (
            <Card>
              <CardContent className="flex flex-col gap-2 text-sm">
                <h2 className="font-semibold">Earlier applications</h2>
                <ul className="flex flex-col gap-2">
                  {app.previous.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/admin/verifications/${p.id}`}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        Attempt {p.attempt}: {STATUS_LABEL[p.status] ?? p.status}
                      </Link>
                      <div className="text-ink-600">{fmt(p.reviewedAt ?? p.submittedAt)}</div>
                      {p.decisionReason && <div className="text-ink-600">{p.decisionReason}</div>}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </div>
  )
}
