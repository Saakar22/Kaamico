import { z } from 'zod'
import { route } from '@/lib/http'
import { clientIp, readJson } from '@/lib/request'
import { requestPasswordReset } from '@/modules/auth/password-reset'

const body = z.object({ email: z.email().max(254) })

/** Always the same answer, whether or not the address is an admin. */
export const POST = route(async (request) => {
  const input = body.parse(await readJson(request))
  await requestPasswordReset({ email: input.email, ip: clientIp(request) })
  return Response.json({ sent: true })
})
