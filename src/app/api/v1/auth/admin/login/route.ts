import { z } from 'zod'
import { route } from '@/lib/http'
import { clientIp, readJson, userAgent } from '@/lib/request'
import { loginAdmin } from '@/modules/auth/admin-login'
import { safeNextPath } from '@/modules/auth/redirects'
import { setSessionCookie } from '@/modules/auth/responses'

const body = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(200),
  next: z.string().max(300).optional(),
})

export const POST = route(async (request) => {
  const input = body.parse(await readJson(request))
  const session = await loginAdmin({
    email: input.email,
    password: input.password,
    ip: clientIp(request),
    userAgent: userAgent(request),
  })
  const next = safeNextPath(input.next, '/admin')
  return setSessionCookie(
    Response.json({ redirectTo: next.startsWith('/admin') ? next : '/admin' }),
    session.token,
    session.expiresAt,
  )
})
