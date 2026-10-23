/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute, type PrecacheEntry } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (PrecacheEntry | string)[] }

// Offline shell (same behaviour as the generated worker in phase 1).
self.skipWaiting()
clientsClaim()
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

// Sent by supabase/functions/send-reminders.
type PushPayload = { title?: string; body?: string; url?: string; count?: number }

type BadgeNavigator = WorkerNavigator & {
  setAppBadge?: (n?: number) => Promise<void>
  clearAppBadge?: () => Promise<void>
}

self.addEventListener('push', (event) => {
  let data: PushPayload
  try {
    data = event.data?.json() ?? {}
  } catch {
    data = { body: event.data?.text() }
  }
  const nav = self.navigator as BadgeNavigator
  // iOS revokes push permission if a push doesn't show a notification, so always show one.
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title ?? 'Office Plants', {
        body: data.body,
        icon: 'pwa-192x192.png',
        data: { url: data.url ?? './' },
      }),
      (data.count ? nav.setAppBadge?.(data.count) : nav.clearAppBadge?.())?.catch(() => undefined),
    ]),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url ?? './', self.registration.scope).href
  event.waitUntil(
    (async () => {
      const [client] = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      if (!client) return void (await self.clients.openWindow(url))
      await client.focus()
      await client.navigate(url).catch(() => undefined)
    })(),
  )
})
