export type Role = 'CUSTOMER' | 'WORKER' | 'ADMIN'
export type SessionScope = 'USER' | 'ADMIN'

/** The authenticated user acting on a request. Narrow on purpose: safe to pass to UI. */
export type Actor = {
  userId: string
  sessionId: string
  scope: SessionScope
  name: string | null
  phone: string | null
  email: string | null
  roles: Role[]
  /** True until a phone user has given their name and chosen a role. */
  needsOnboarding: boolean
  workerId: string | null
}

/** Admin powers require the ADMIN role *and* a session from the admin login. */
export function hasRole(actor: Actor, role: Role): boolean {
  if (role === 'ADMIN') return actor.scope === 'ADMIN' && actor.roles.includes('ADMIN')
  return actor.roles.includes(role)
}
