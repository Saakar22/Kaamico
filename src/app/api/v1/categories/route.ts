import { connection } from 'next/server'
import { route } from '@/lib/http'
import { listCategories } from '@/modules/catalog/catalog'

const PUBLIC_CACHE = { 'cache-control': 'public, max-age=60, stale-while-revalidate=300' }

export const GET = route(async () => {
  await connection()
  const categories = await listCategories()
  return Response.json(
    {
      categories: categories.map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        description: c.description,
        icon: c.iconKey,
        servicesCount: c.servicesCount,
      })),
    },
    { headers: PUBLIC_CACHE },
  )
})
