import { ScrollText } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/patterns/page-header'
import { Pager } from '@/components/patterns/pager'
import { EmptyState } from '@/components/patterns/states'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, NativeSelect } from '@/components/ui/input'
import { Table, TD, TH, THead, TR } from '@/components/ui/table'
import { formatIstDateTime } from '@/lib/time'
import { auditActions, auditQuery, listAuditLogs } from '@/modules/audit/audit'
import { requirePageActor } from '@/modules/auth/page-guards'

export const instant = false

export const metadata: Metadata = { title: 'Audit log' }

const one = (v: string | string[] | undefined) => (typeof v === 'string' && v ? v : undefined)
const words = (action: string) => action.replaceAll('_', ' ').toLowerCase()

/** Where an audited entity can be opened, when there is a page for it. */
function entityHref(type: string, id: string, after: unknown): string | null {
  switch (type) {
    case 'verification_application':
      return `/admin/verifications/${id}`
    case 'verification_document': {
      const app = (after as { applicationId?: string } | null)?.applicationId
      return app ? `/admin/verifications/${app}` : null
    }
    case 'booking':
      return `/admin/bookings/${id}`
    default:
      return null
  }
}

/** Every admin action and document view, newest first. Read-only by design. */
export default async function AuditLogPage({
  searchParams,
}: PageProps<'/[lang]/admin/audit-logs'>) {
  await requirePageActor('ADMIN')
  const raw = await searchParams
  const params = {
    action: one(raw.action),
    entityType: one(raw.entityType),
    entityId: one(raw.entityId),
  }
  const parsed = auditQuery.safeParse({ ...params, page: one(raw.page) })
  const [result, actions] = await Promise.all([
    parsed.success ? listAuditLogs(parsed.data) : null,
    auditActions(),
  ])

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Audit log"
        description="Every admin action and identity-document view. Entries cannot be changed or removed."
      />
      <form
        method="get"
        className="grid gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
      >
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Action
          <NativeSelect name="action" defaultValue={params.action ?? ''}>
            <option value="">Any</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {words(a)}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Entity type
          <NativeSelect name="entityType" defaultValue={params.entityType ?? ''}>
            <option value="">Any</option>
            <option value="verification_application">Verification application</option>
            <option value="verification_document">Verification document</option>
            <option value="booking">Booking</option>
            <option value="user">User</option>
            <option value="service_category">Category</option>
            <option value="service">Service</option>
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Entity ID
          <Input name="entityId" defaultValue={params.entityId} />
        </label>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>

      {!result ? (
        <p role="alert" className="text-danger-700">
          Some filters are not valid.
        </p>
      ) : result.logs.length === 0 ? (
        <Card>
          <EmptyState
            icon={ScrollText}
            title="No entries"
            description="Nothing matches these filters."
          />
        </Card>
      ) : (
        <Table label="Audit entries">
          <THead>
            <tr>
              <TH>When</TH>
              <TH>Admin</TH>
              <TH>Action</TH>
              <TH>Entity</TH>
              <TH>Reason and change</TH>
            </tr>
          </THead>
          <tbody>
            {result.logs.map((l) => {
              const href = entityHref(l.entityType, l.entityId, l.after)
              return (
                <TR key={l.id}>
                  <TD className="whitespace-nowrap">{formatIstDateTime(new Date(l.createdAt))}</TD>
                  <TD>
                    {l.adminName}
                    {l.ip && <div className="text-xs text-ink-600">{l.ip}</div>}
                  </TD>
                  <TD className="font-medium">{words(l.action)}</TD>
                  <TD>
                    <span className="text-xs text-ink-600">
                      {l.entityType.replaceAll('_', ' ')}
                    </span>
                    <div className="font-mono text-xs break-all">
                      {href ? (
                        <Link href={href} className="text-brand-700 hover:underline">
                          {l.entityId}
                        </Link>
                      ) : (
                        l.entityId
                      )}
                    </div>
                  </TD>
                  <TD className="max-w-md">
                    {l.reason && <p>{l.reason}</p>}
                    {(l.before !== null || l.after !== null) && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-brand-700">Details</summary>
                        <pre className="mt-1 overflow-x-auto rounded bg-surface-muted p-2">
                          {JSON.stringify({ before: l.before, after: l.after }, null, 2)}
                        </pre>
                      </details>
                    )}
                  </TD>
                </TR>
              )
            })}
          </tbody>
        </Table>
      )}
      {result && (
        <Pager
          path="/admin/audit-logs"
          params={params}
          page={result.page}
          hasMore={result.hasMore}
        />
      )}
    </div>
  )
}
