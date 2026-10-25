import { z } from 'zod'
import { route } from '@/lib/http'
import { clientIp, readJson } from '@/lib/request'
import { requestOtp } from '@/modules/auth/otp'

const body = z.object({ phone: z.string().max(20) })

export const POST = route(async (request) => {
  const input = body.parse(await readJson(request))
  const result = await requestOtp({ phone: input.phone, ip: clientIp(request) })
  return Response.json(result, { headers: { 'cache-control': 'no-store' } })
})
