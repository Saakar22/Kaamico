import { z } from 'zod'
import { route } from '@/lib/http'
import { readJson } from '@/lib/request'
import { auditContext } from '@/modules/audit/audit'
import { MIN_PASSWORD_LENGTH, resetPassword } from '@/modules/auth/password-reset'

const body = z.object({
  token: z.string().min(20).max(100),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters`)
    .max(200),
})

export const POST = route(async (request, _ctx, { requestId }) => {
  const input = body.parse(await readJson(request))
  await resetPassword({ ...input, context: auditContext(request, requestId) })
  return Response.json({ reset: true })
})
