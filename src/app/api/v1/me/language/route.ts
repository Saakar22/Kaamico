import { route } from '@/lib/http'
import { readJson } from '@/lib/request'
import { requireApiActor } from '@/modules/auth/actor'
import { setPreferredLocale } from '@/modules/auth/language'

/** `{locale}`: saves the language on the account (the switch also sets the cookie). */
export const PUT = route(async (request) => {
  const actor = await requireApiActor(request, { allowOnboarding: true })
  const locale = await setPreferredLocale(actor.userId, await readJson(request))
  return Response.json({ locale }, { headers: { 'cache-control': 'no-store' } })
})
