import { Users } from 'lucide-react'
import type { Metadata } from 'next'
import { ReasonActionDialog } from '@/components/domain/admin/reason-action-dialog'
import { PageHeader } from '@/components/patterns/page-header'
import { Pager } from '@/components/patterns/pager'
import { EmptyState } from '@/components/patterns/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, NativeSelect } from '@/components/ui/input'
import { Table, TD, TH, THead, TR } from '@/components/ui/table'
import { formatIstDateTime } from '@/lib/time'
import { adminUserQuery, listAdminUsers } from '@/modules/admin/users'
import { requirePageActor } from '@/modules/auth/page-guards'

export const instant = false

export const metadata: Metadata = { title: 'Users' }

const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined)
const ROLE_LABEL: Record<string, string> = {
  CUSTOMER: 'Customer',
  WORKER: 'Professional',
  ADMIN: 'Admin',
}

export default async function AdminUsersPage({ searchParams }: PageProps<'/[lang]/admin/users'>) {
  await requirePageActor('ADMIN')
  const raw = await searchParams
  const params = { q: one(raw.q), role: one(raw.role), status: one(raw.status) }
  const parsed = adminUserQuery.safeParse({ ...params, page: one(raw.page) })
  const result = parsed.success ? await listAdminUsers(parsed.data) : null

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Users"
        description="Suspending signs the person out, takes a professional offline and cancels their open requests."
      />
      <form
        method="get"
        className="grid gap-3 rounded-md border border-border bg-surface p-4 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end"
      >
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Search
          <Input name="q" defaultValue={params.q} placeholder="Name, phone or email" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Role
          <NativeSelect name="role" defaultValue={params.role ?? ''}>
            <option value="">Any</option>
            <option value="CUSTOMER">Customers</option>
            <option value="WORKER">Professionals</option>
            <option value="ADMIN">Admins</option>
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Status
          <NativeSelect name="status" defaultValue={params.status ?? ''}>
            <option value="">Any</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
          </NativeSelect>
        </label>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>

      {!result ? (
        <p role="alert" className="text-danger-700">
          Some filters are not valid.
        </p>
      ) : result.items.length === 0 ? (
        <Card>
          <EmptyState icon={Users} title="No users match" description="Try another search." />
        </Card>
      ) : (
        <Table label="Users">
          <THead>
            <tr>
              <TH>Name</TH>
              <TH>Roles</TH>
              <TH>Status</TH>
              <TH>Professional</TH>
              <TH>Bookings</TH>
              <TH>Joined</TH>
              <TH>
                <span className="sr-only">Actions</span>
              </TH>
            </tr>
          </THead>
          <tbody>
            {result.items.map((u) => {
              const name = u.name ?? u.phone ?? u.email ?? 'Unnamed'
              const isAdmin = u.roles.includes('ADMIN')
              return (
                <TR key={u.id}>
                  <TD>
                    <span className="font-medium">{name}</span>
                    <div className="text-xs text-ink-600">{u.phone ?? u.email}</div>
                  </TD>
                  <TD>{u.roles.map((r) => ROLE_LABEL[r] ?? r).join(', ')}</TD>
                  <TD>
                    <Badge tone={u.status === 'ACTIVE' ? 'success' : 'danger'}>
                      {u.status.toLowerCase()}
                    </Badge>
                  </TD>
                  <TD>
                    {u.worker ? (
                      <span className="flex flex-col text-xs">
                        <span>ID: {u.worker.verificationStatus.toLowerCase()}</span>
                        <span className="text-ink-600">
                          {u.worker.ratingAvg !== null ? `★ ${u.worker.ratingAvg} · ` : ''}
                          {u.worker.completedJobs} jobs · {u.worker.cancellations} cancelled
                        </span>
                      </span>
                    ) : (
                      '–'
                    )}
                  </TD>
                  <TD>{u.bookings}</TD>
                  <TD className="whitespace-nowrap">{formatIstDateTime(new Date(u.createdAt))}</TD>
                  <TD>
                    {!isAdmin &&
                      (u.status === 'ACTIVE' ? (
                        <ReasonActionDialog
                          label="Suspend"
                          size="sm"
                          title={`Suspend ${name}?`}
                          description="They are signed out at once and cannot sign in. Open requests are cancelled; confirmed jobs stay for you to handle."
                          endpoint={`/api/v1/admin/users/${u.id}/status`}
                          method="PATCH"
                          body={{ status: 'SUSPENDED' }}
                          success="Account suspended"
                        />
                      ) : (
                        <ReasonActionDialog
                          label="Reactivate"
                          size="sm"
                          variant="secondary"
                          title={`Reactivate ${name}?`}
                          description="They can sign in again. A professional must go online again themselves."
                          endpoint={`/api/v1/admin/users/${u.id}/status`}
                          method="PATCH"
                          body={{ status: 'ACTIVE' }}
                          success="Account reactivated"
                        />
                      ))}
                  </TD>
                </TR>
              )
            })}
          </tbody>
        </Table>
      )}
      {result && (
        <Pager path="/admin/users" params={params} page={result.page} hasMore={result.hasMore} />
      )}
    </div>
  )
}
