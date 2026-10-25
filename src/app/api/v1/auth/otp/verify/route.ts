import { z } from 'zod'
import { AppError } from '@/lib/errors'
import { route } from '@/lib/http'
import { clientIp, readJson, userAgent } from '@/lib/request'
import { verifyOtp } from '@/modules/auth/otp'
import { homePathFor, safeNextPath } from '@/modules/auth/redirects'
import { publicUser, setSessionCookie } from '@/modules/auth/responses'
import { resolveSession } from '@/modules/auth/sessions'

const body = z.object({
  phone: z.string().max(20),
  code: z.string().max(10),
  next: z.string().max(300).optional(),
})

export const POST = route(async (request) => {
  const input = body.parse(await readJson(request))
  const session = await verifyOtp({
    phone: input.phone,
    code: input.code.trim(),
    ip: clientIp(request),
    userAgent: userAgent(request),
  })
  const actor = await resolveSession(session.token)
  if (!actor) throw new AppError('INTERNAL', 'Session could not be created')

  const home = homePathFor(actor)
  const redirectTo = actor.needsOnboarding ? home : safeNextPath(input.next, home)
  return setSessionCookie(
    Response.json({ user: publicUser(actor), isNewUser: session.isNewUser, redirectTo }),
    session.token,
    session.expiresAt,
  )
})
