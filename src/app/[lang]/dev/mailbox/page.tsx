import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { PageHeader } from '@/components/patterns/page-header'
import { EmptyState } from '@/components/patterns/states'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { devMailbox } from '@/modules/notifications/email'
import { Mail } from 'lucide-react'

export const metadata: Metadata = { title: 'Dev mailbox' }

/** Emails "sent" in console mode by this server process (IMPLEMENTATION_PLAN.md §13). */
async function Messages() {
  await connection()
  const mail = devMailbox()
  if (mail.length === 0) {
    return (
      <EmptyState
        icon={Mail}
        title="No emails yet"
        description="Emails sent while EMAIL_MODE=console show up here."
      />
    )
  }
  return (
    <ol className="flex flex-col gap-4">
      {mail.map((m) => (
        <li key={`${m.sentAt}:${m.subject}`}>
          <Card>
            <CardHeader>
              <h2 className="font-semibold">{m.subject}</h2>
              <p className="text-sm text-ink-600">
                To {m.to} ·{' '}
                {new Date(m.sentAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
              </p>
            </CardHeader>
            <CardContent>
              <pre className="text-sm break-all whitespace-pre-wrap">{m.text}</pre>
            </CardContent>
          </Card>
        </li>
      ))}
    </ol>
  )
}

export default function DevMailboxPage() {
  return (
    <main id="main-content" className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <PageHeader title="Dev mailbox" description="Nothing here was really sent." />
      <Suspense fallback={<Skeleton className="h-40 w-full" />}>
        <Messages />
      </Suspense>
    </main>
  )
}
