import type { MetadataRoute } from 'next'
import { connection } from 'next/server'
import { getEnv } from '@/config/env'

/**
 * Crawl public discovery pages only; accounts, consoles and the API stay out. A public
 * demo (simulation allowed in production) is not crawled at all: its professionals and
 * prices are seed data. Read at request time, like the demo banner.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  await connection()
  const env = getEnv()
  if (env.NODE_ENV === 'production' && env.ALLOW_SIMULATION_IN_PRODUCTION) {
    return { rules: { userAgent: '*', disallow: '/' } }
  }
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/admin',
        '/worker',
        '/dashboard',
        '/bookings',
        '/book/',
        '/favorites',
        '/profile',
        '/support',
        '/login',
        '/dev/',
        // Results depend on the visitor's location; city pages are the crawlable version.
        '/search',
      ],
    },
    sitemap: `${env.APP_URL}/sitemap.xml`,
  }
}
