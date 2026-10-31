import { NextResponse, type NextRequest } from 'next/server'
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from '@/i18n/config'
import { SESSION_COOKIE_PLAIN, SESSION_COOKIE_SECURE } from '@/modules/auth/cookies'

/** Signed-in areas. Visitors without a session cookie are sent to the right login page. */
const PRIVATE = [
  '/admin',
  '/worker',
  '/dashboard',
  '/bookings',
  '/addresses',
  '/favorites',
  '/payments',
  '/notifications',
  '/profile',
  '/settings',
  '/book',
  '/support',
]
const under = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`)

const YEAR_SECONDS = 365 * 24 * 60 * 60

/**
 * Two jobs for every page request:
 * 1. Language: URLs carry none, so the request is rewritten to `/<locale>/…` from the
 *    `kmc_lang` cookie (English by default). A shared `/hi/…` or `/en/…` link sets that
 *    language and redirects to the plain URL.
 * 2. An optimistic sign-in gate: private areas without a session cookie go to the login
 *    page. Real checks (valid session, role, ownership) happen on the server in layouts
 *    and API handlers.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  const prefix = pathname.split('/')[1]
  if (isLocale(prefix)) {
    const plain = new URL(pathname.slice(prefix.length + 1) || '/', request.url)
    plain.search = search
    const response = NextResponse.redirect(plain)
    response.cookies.set(LOCALE_COOKIE, prefix, {
      path: '/',
      maxAge: YEAR_SECONDS,
      sameSite: 'lax',
    })
    return response
  }

  const isPrivate = PRIVATE.some((p) => under(pathname, p)) && pathname !== '/admin/login'
  const hasSession =
    request.cookies.has(SESSION_COOKIE_SECURE) || request.cookies.has(SESSION_COOKIE_PLAIN)
  if (isPrivate && !hasSession) {
    const login = new URL(pathname.startsWith('/admin') ? '/admin/login' : '/login', request.url)
    login.searchParams.set('next', pathname + search)
    return NextResponse.redirect(login)
  }

  const chosen = request.cookies.get(LOCALE_COOKIE)?.value
  // The admin console is English only.
  const locale: Locale = under(pathname, '/admin') || !isLocale(chosen) ? DEFAULT_LOCALE : chosen
  const target = new URL(`/${locale}${pathname === '/' ? '' : pathname}`, request.url)
  target.search = search
  return NextResponse.rewrite(target)
}

export const config = {
  // Pages only: not API routes, internal jobs, Next's assets or files such as /sw.js.
  matcher: ['/((?!api/|internal/|_next/|.*\\.[a-z0-9]+$).*)'],
}
