import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { Logo } from '@/components/brand/logo'
import { Skeleton } from '@/components/ui/skeleton'
import { getActor } from '@/modules/auth/actor'
import { hasRole } from '@/modules/auth/types'
import { AdminLoginForm } from './admin-login-form'

export const metadata: Metadata = { title: 'Admin sign in', robots: { index: false } }

async function AdminLoginGate({
  searchParams,
}: {
  searchParams: PageProps<'/admin/login'>['searchParams']
}) {
  const params = await searchParams
  const actor = await getActor()
  if (actor && hasRole(actor, 'ADMIN')) redirect('/admin')
  return <AdminLoginForm next={typeof params.next === 'string' ? params.next : undefined} />
}

export default function AdminLoginPage(props: PageProps<'/admin/login'>) {
  return (
    <main
      id="main-content"
      className="flex flex-1 flex-col items-center bg-surface-muted px-4 py-10 sm:justify-center"
    >
      <div className="flex w-full max-w-sm flex-col gap-6 rounded-lg border border-border bg-surface p-6 shadow-xs">
        <div className="flex flex-col gap-2">
          <Logo />
          <h1 className="font-display text-2xl font-bold">Admin sign in</h1>
          <p className="text-sm text-ink-600">For Kaamico operations staff only.</p>
        </div>
        <Suspense fallback={<Skeleton className="h-56 w-full" />}>
          <AdminLoginGate searchParams={props.searchParams} />
        </Suspense>
      </div>
    </main>
  )
}
