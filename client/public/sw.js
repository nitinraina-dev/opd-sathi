// OPD Saathi service worker.
// 1. Shows alerts pushed by the server, even when the app is closed.
// 2. Keeps the app's files so it opens quickly (and offline) on a weak
//    connection. Live data (/api) always comes from the network.

const CACHE = 'opd-saathi-v1'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key)
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return

  // Built files have a content hash in their name, so a saved copy is always right.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(CACHE).then((c) => c.put(req, copy))
            }
            return res
          }),
      ),
    )
    return
  }

  // Pages: try the network first, fall back to the saved app when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put('/', copy))
          }
          return res
        })
        .catch(() => caches.match('/')),
    )
  }
})

self.addEventListener('push', (event) => {
  let d = {}
  try {
    d = event.data ? event.data.json() : {}
  } catch {
    d = { body: event.data && event.data.text() }
  }
  event.waitUntil(
    self.registration.showNotification(d.title || 'OPD Saathi', {
      body: d.body || '',
      tag: d.tag,
      renotify: true,
      requireInteraction: !!d.urgent,
      vibrate: d.urgent ? [500, 200, 500, 200, 500] : [300, 150, 300],
      lang: d.lang,
      icon: '/icon.svg',
      badge: '/icon.svg',
      data: { url: d.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const w of wins) {
        if (new URL(w.url).pathname === url && 'focus' in w) return w.focus()
      }
      return self.clients.openWindow(url)
    })(),
  )
})
