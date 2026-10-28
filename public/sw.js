// Kaamico service worker: makes the app installable and shows a friendly offline page.
// It deliberately caches nothing else: pages hold personal data (bookings, earnings),
// and prices and availability must always be live. Bump VERSION when offline.html changes.
const VERSION = 'v1'
const CACHE = `kmc-offline-${VERSION}`
const OFFLINE_URL = '/offline.html'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' }))),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      // Start page requests while the worker boots, so it adds no delay.
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable()
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  // Only full page loads; everything else goes straight to the network as usual.
  if (event.request.mode !== 'navigate') return
  event.respondWith(
    (async () => {
      try {
        const preloaded = await event.preloadResponse
        return preloaded || (await fetch(event.request))
      } catch {
        return (await caches.match(OFFLINE_URL)) || Response.error()
      }
    })(),
  )
})
