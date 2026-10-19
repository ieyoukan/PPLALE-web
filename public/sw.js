// Service worker of the installed app (PWA). It caches nothing, so the site always comes from the
// network as before; it only shows push notifications and opens the page a notification points to.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

// Payload: { title, body, url, tag }. A tag replaces the earlier notification of the same kind.
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification(data.title || 'ぷぷりえーる', {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag,
    renotify: !!data.tag,
    data: { url: data.url || '/game/' },
  }));
});

// Open (or focus) the page the notification is about.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/game/', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find(client => client.url === url) ?? windows.find(client => new URL(client.url).origin === self.location.origin);
    if (open) {
      await open.focus();
      if (open.url !== url && 'navigate' in open) await open.navigate(url).catch(() => {});
      return;
    }
    await self.clients.openWindow(url);
  })());
});
