// Service worker: shows Web Push notifications, answers Claude's menus from their
// buttons and opens the app on the pane. No offline cache: the app is useless
// without the hub anyway.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'twb', body: event.data ? event.data.text() : '' };
  }
  const { title = 'twb', body = '', tag = 'tmux', url = '/', actions = [], respond = null } = data;
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      renotify: true,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      actions,
      data: { url, respond },
    }),
  );
});

async function openApp(url) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of windows) {
    if (new URL(client.url).origin !== self.location.origin) continue;
    await client.focus();
    client.postMessage({ type: 'navigate', url });
    return;
  }
  await self.clients.openWindow(url);
}

self.addEventListener('notificationclick', (event) => {
  const { url: path = '/', respond } = event.notification.data ?? {};
  const url = new URL(path, self.location.origin).href;
  event.notification.close();

  // An answer button: pick that option without opening the app. The hub checks the
  // pane still shows the same menu; if not (or on any error), open the pane instead.
  if (event.action.startsWith('choice:') && respond) {
    const key = event.action.slice('choice:'.length);
    event.waitUntil(
      (async () => {
        try {
          const res = await fetch('/api/respond', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...respond, key }),
          });
          if (res.ok) return;
        } catch {
          /* fall through to opening the app */
        }
        await openApp(url);
      })(),
    );
    return;
  }

  event.waitUntil(openApp(url));
});
