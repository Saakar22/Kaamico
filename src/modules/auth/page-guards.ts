import 'server-only'
import { redirect } from 'next/navigation'
import { getActor } from './actor'
import { hasRole, type Actor, type Role } from './types'

/**
 * Page-level authorisation. Layout gates do not re-run on client navigations between
 * sibling pages, so every protected page must call this itself (Next.js guidance).
 * Reads cookies: the page must sit inside a <Suspense> boundary (its loading.tsx).
 */
export async function requirePageActor(role?: Role): Promise<Actor> {
  const actor = await getActor()
  if (!actor) redirect(role === 'ADMIN' ? '/admin/login' : '/login')
  if (role !== 'ADMIN' && actor.needsOnboarding) redirect('/login?step=details')
  if (role && !hasRole(actor, role)) redirect(role === 'ADMIN' ? '/admin/login' : '/')
  return actor
}
