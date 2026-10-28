import type { MetadataRoute } from 'next'
import { brand } from '@/config/brand'

/** Web app manifest: lets phones install Kaamico to the home screen (P1 PWA). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: `${brand.name}: ${brand.tagline}`,
    short_name: brand.name,
    description: brand.description,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#0b6e4f',
    lang: 'en-IN',
    categories: ['lifestyle', 'business', 'utilities'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Find a service', url: '/services' },
      { name: 'Your bookings', url: '/bookings' },
      { name: 'Requests (professionals)', short_name: 'Requests', url: '/worker/requests' },
    ],
  }
}
