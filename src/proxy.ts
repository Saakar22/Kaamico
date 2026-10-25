import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE_PLAIN, SESSION_COOKIE_SECURE } from '@/modules/auth/cookies'

/**
 * Optimistic gate only: sends visitors without a session cookie to the right login
 * page. Real checks (valid session, role, ownership) happen on the server in layouts
 * and API handlers.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  if (pathname === '/admin/login') return NextResponse.next()

  const hasSession =
    request.cookies.has(SESSION_COOKIE_SECURE) || request.cookies.has(SESSION_COOKIE_PLAIN)
  if (hasSession) return NextResponse.next()

  const login = new URL(pathname.startsWith('/admin') ? '/admin/login' : '/login', request.url)
  login.searchParams.set('next', pathname + search)
  return NextResponse.redirect(login)
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/worker/:path*',
    '/dashboard',
    '/bookings/:path*',
    '/addresses',
    '/favorites',
    '/payments',
    '/notifications',
    '/profile',
    '/settings',
    '/book/:path*',
  ],
}
