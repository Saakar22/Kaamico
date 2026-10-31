import { z } from 'zod'
import { AppError } from '@/lib/errors'
import { route } from '@/lib/http'
import { clientIp, readJson, userAgent } from '@/lib/request'
import { isLocale, LOCALE_COOKIE } from '@/i18n/config'
import { getPreferredLocale, setPreferredLocale } from '@/modules/auth/language'
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
  const response = setSessionCookie(
    Response.json({ user: publicUser(actor), isNewUser: session.isNewUser, redirectTo }),
    session.token,
    session.expiresAt,
  )
  // The language follows the person: a new account keeps the one it signed up in; on a
  // browser that has not chosen one, a returning person gets their saved language.
  const chosen = readCookie(request, LOCALE_COOKIE)
  if (session.isNewUser && isLocale(chosen)) {
    await setPreferredLocale(actor.userId, { locale: chosen })
  } else if (!isLocale(chosen)) {
    const saved = await getPreferredLocale(actor.userId)
    response.headers.append(
      'set-cookie',
      `${LOCALE_COOKIE}=${saved}; Path=/; Max-Age=${365 * 24 * 60 * 60}; SameSite=Lax`,
    )
  }
  return response
})

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get('cookie') ?? ''
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key === name) return decodeURIComponent(value.join('='))
  }
  return undefined
}
