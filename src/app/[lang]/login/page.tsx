import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { Logo } from '@/components/brand/logo'
import { LanguageSwitch } from '@/components/layout/language-switch'
import { Skeleton } from '@/components/ui/skeleton'
import { getT } from '@/i18n/server'
import { getActor } from '@/modules/auth/actor'
import { homePathFor, safeNextPath } from '@/modules/auth/redirects'
import { LoginFlow } from './login-flow'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('login.metaTitle') }
}

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

export default async function LoginPage(props: PageProps<'/[lang]/login'>) {
  const t = await getT()
  return (
    <main
      id="main-content"
      className="flex flex-1 flex-col items-center px-4 py-10 sm:justify-center"
    >
      <div className="flex w-full max-w-sm flex-col gap-8">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="inline-flex h-11 w-fit items-center rounded-md">
            <Logo />
          </Link>
          <LanguageSwitch />
        </div>
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
          {t('login.agreePrefix')}{' '}
          <Link href="/terms" className="font-medium text-brand-700 underline">
            {t('login.terms')}
          </Link>{' '}
          {t('login.and')}{' '}
          <Link href="/privacy" className="font-medium text-brand-700 underline">
            {t('login.privacy')}
          </Link>
          .
        </p>
      </div>
    </main>
  )
}
