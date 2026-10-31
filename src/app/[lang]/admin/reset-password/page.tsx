import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Logo } from '@/components/brand/logo'
import { Skeleton } from '@/components/ui/skeleton'
import { ResetPasswordForm } from './reset-password-form'

export const metadata: Metadata = {
  title: 'Choose a new password',
  robots: { index: false },
  // The token is in the URL: never send it on to other sites.
  referrer: 'no-referrer',
}

async function ResetGate({
  searchParams,
}: {
  searchParams: PageProps<'/[lang]/admin/reset-password'>['searchParams']
}) {
  const { token } = await searchParams
  return <ResetPasswordForm token={typeof token === 'string' ? token : ''} />
}

export default function AdminResetPasswordPage(props: PageProps<'/[lang]/admin/reset-password'>) {
  return (
    <main
      id="main-content"
      className="flex flex-1 flex-col items-center bg-surface-muted px-4 py-10 sm:justify-center"
    >
      <div className="flex w-full max-w-sm flex-col gap-6 rounded-md border border-border bg-surface p-6 shadow-xs">
        <div className="flex flex-col gap-2">
          <Logo />
          <h1 className="font-display text-2xl font-semibold">Choose a new password</h1>
          <p className="text-sm text-ink-600">
            Use at least 12 characters. You&apos;ll be signed out everywhere and can then sign in
            with the new password.
          </p>
        </div>
        <Suspense fallback={<Skeleton className="h-40 w-full" />}>
          <ResetGate searchParams={props.searchParams} />
        </Suspense>
      </div>
    </main>
  )
}
