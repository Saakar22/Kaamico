import { connection } from 'next/server'
import { route } from '@/lib/http'
import { auditContext } from '@/modules/audit/audit'
import { requireApiActor } from '@/modules/auth/actor'
import { documentLinkForAdmin } from '@/modules/verification/documents-admin'

/** Admin only: a 5-minute signed link to one identity document. Every call is audited. */
export const GET = route<RouteContext<'/api/v1/admin/verification-documents/[id]/url'>>(
  async (request, ctx, { requestId }) => {
    await connection()
    const admin = await requireApiActor(request, { role: 'ADMIN' })
    const link = await documentLinkForAdmin(
      admin,
      (await ctx.params).id,
      auditContext(request, requestId),
    )
    return Response.json(link, { headers: { 'cache-control': 'no-store' } })
  },
)
