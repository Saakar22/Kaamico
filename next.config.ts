import type { NextConfig } from 'next'

// Baseline browser hardening for every response. Device location powers the location
// chip; nothing uses the camera or microphone directly (ID photos come through file inputs).
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
  // Browsers ignore this over plain HTTP, so it is safe locally.
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
]

const nextConfig: NextConfig = {
  // The container image (Dockerfile) ships the self-contained server; local and CI runs
  // keep using `next start`.
  output: process.env.BUILD_STANDALONE === '1' ? 'standalone' : undefined,
  poweredByHeader: false,
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Unknown URLs: the root layout sits under [lang], so the 404 page is app/global-not-found.
    globalNotFound: true,
  },
  turbopack: {
    // Pin the workspace root; a stray lockfile in a parent folder would otherwise be picked up.
    root: import.meta.dirname,
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // Browsers check for a new service worker on each visit; never serve a cached copy.
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ]
  },
}

export default nextConfig
