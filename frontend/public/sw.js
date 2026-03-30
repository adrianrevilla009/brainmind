// BrainMind — Service Worker para Web Push Notifications
// Archivo: /public/sw.js

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

// Recibir push
self.addEventListener('push', event => {
  if (!event.data) return

  let data = {}
  try { data = event.data.json() } catch { data = { title: 'BrainMind', body: event.data.text() } }

  const { title = 'BrainMind', body = '', url = '/dashboard' } = data

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon:  '/icon-192.png',
      badge: '/icon-72.png',
      tag:   'brainmind-notification',
      data:  { url },
      actions: [{ action: 'open', title: 'Abrir' }],
      vibrate: [200, 100, 200],
    })
  )
})

// Click en notificación → abrir app
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = event.notification.data?.url || '/dashboard'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // Si ya hay una ventana abierta, enfocarla y navegar
      for (const client of clients) {
        if ('focus' in client) {
          client.focus()
          client.navigate?.(url)
          return
        }
      }
      // Si no, abrir nueva
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })
  )
})
