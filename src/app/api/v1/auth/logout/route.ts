import { route } from '@/lib/http'
import { readSessionToken } from '@/modules/auth/cookies'
import { clearSession } from '@/modules/auth/responses'
import { revokeSession } from '@/modules/auth/sessions'

export const POST = route(async (request) => {
  const token = readSessionToken(request.headers.get('cookie'))
  if (token) await revokeSession(token)
  return clearSession(Response.json({ ok: true }))
})
