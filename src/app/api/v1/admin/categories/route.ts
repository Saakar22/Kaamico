import { route } from '@/lib/http'
import { readJson } from '@/lib/request'
import { noStore, requireAdmin } from '@/modules/admin/api'
import { createCategory, listCatalogForAdmin } from '@/modules/admin/catalog'
import { auditContext } from '@/modules/audit/audit'

/** Every category with its services, including inactive ones. */
export const GET = route(async (request) => {
  await requireAdmin(request)
  return Response.json({ categories: await listCatalogForAdmin() }, { headers: noStore })
})

export const POST = route(async (request, _ctx, { requestId }) => {
  const admin = await requireAdmin(request)
  const category = await createCategory(
    admin,
    await readJson(request),
    auditContext(request, requestId),
  )
  return Response.json({ category }, { status: 201 })
})
