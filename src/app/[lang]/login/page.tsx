import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { Logo } from '@/components/brand/logo'
import { Skeleton } from '@/components/ui/skeleton'
import { getActor } from '@/modules/auth/actor'
import { homePathFor, safeNextPath } from '@/modules/auth/redirects'
import { LoginFlow } from './login-flow'

export const metadata: Metadata = { title: 'Sign in' }

async function LoginGate({
  searchParams,
}: {
  searchParams: PageProps<'/[lang]/login'>['searchParams']
}) {
  const params = await searchParams
  const next = typeof params.next === 'string' ? params.next : undefined
  const actor = await getActor()

  // Signed-in users skip the form (admins have their own console).
  if (actor && !actor.needsOnboarding) {
    redirect(actor.scope === 'ADMIN' ? '/admin' : safeNextPath(next, homePathFor(actor)))
  }
  return <LoginFlow initialStep={actor?.needsOnboarding ? 'details' : 'phone'} next={next} />
}

export default function LoginPage(props: PageProps<'/[lang]/login'>) {
  return (
    <main
      id="main-content"
      className="flex flex-1 flex-col items-center px-4 py-10 sm:justify-center"
    >
      <div className="flex w-full max-w-sm flex-col gap-8">
        <Link href="/" className="inline-flex h-11 w-fit items-center rounded-md">
          <Logo />
        </Link>
        <Suspense
          fallback={
            <div className="flex flex-col gap-4" aria-hidden="true">
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          }
        >
          <LoginGate searchParams={props.searchParams} />
        </Suspense>
        <p className="text-sm text-ink-600">
          By continuing you agree to Kaamico&apos;s{' '}
          <Link href="/terms" className="font-medium text-brand-700 underline">
            terms
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="font-medium text-brand-700 underline">
            privacy policy
          </Link>
          .
        </p>
      </div>
    </main>
  )
}
