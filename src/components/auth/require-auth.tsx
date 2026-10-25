import { ShieldX } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { ErrorState } from '@/components/patterns/states'
import { Button } from '@/components/ui/button'
import { getActor } from '@/modules/auth/actor'
import { hasRole, type Role } from '@/modules/auth/types'

const deniedCopy: Record<Role, { title: string; description: string }> = {
  ADMIN: {
    title: 'This area is for Kaamico admins',
    description: 'Sign in with an admin account to continue.',
  },
  WORKER: {
    title: 'This area is for professionals',
    description: 'Your account is set up for booking services.',
  },
  CUSTOMER: {
    title: 'You do not have access to this page',
    description: 'Sign in with a customer account to continue.',
  },
}

/**
 * Server-side gate for a section of the app. Reads the session, so render it inside
 * a <Suspense> boundary. API handlers authorise separately; this only guards pages.
 */
export async function RequireAuth({ role, children }: { role?: Role; children: ReactNode }) {
  const actor = await getActor()
  if (!actor) redirect(role === 'ADMIN' ? '/admin/login' : '/login')
  if (role !== 'ADMIN' && actor.needsOnboarding) redirect('/login?step=details')
  if (role && !hasRole(actor, role)) {
    const copy = deniedCopy[role]
    return (
      <ErrorState
        icon={ShieldX}
        title={copy.title}
        description={copy.description}
        action={
          <>
            {role === 'ADMIN' && (
              <Button asChild>
                <Link href="/admin/login">Admin sign in</Link>
              </Button>
            )}
            <Button variant="secondary" asChild>
              <Link href="/">Go to home</Link>
            </Button>
          </>
        }
      />
    )
  }
  return children
}
