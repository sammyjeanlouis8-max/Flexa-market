/* ZENO service worker — Web Push handler.
 * Kept intentionally minimal: no caching strategy, no offline mode.
 * Its sole job is to receive push events and show notifications, and
 * to focus/open the right page when the user clicks one. */

self.addEventListener("install", (event) => {
  // Activate immediately so a fresh subscribe right after registration
  // already has a controlling worker that can receive pushes.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Belt-and-suspenders: if any past version of this SW (or another deployment)
  // cached HTML/JS bundles, evict everything so the next request goes straight
  // to the network and picks up the latest deployed assets. This SW has no
  // `fetch` handler, so cached entries serve no purpose.
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (_) { /* ignore — non-critical */ }
    try { await self.clients.claim(); } catch (_) {}
  })());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    if (event.data) data = event.data.json();
  } catch (_) {
    try { data = { title: "ZENO", body: event.data ? event.data.text() : "" }; } catch { data = {}; }
  }
  const title = data.title || "ZENO";
  const options = {
    body: data.body || "",
    icon: data.icon || "/favicon.svg",
    badge: "/favicon.svg",
    tag: data.tag || undefined,
    data: { url: data.url || "/" },
    renotify: !!data.tag,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    // If a tab on our origin is already open, focus it and navigate.
    for (const client of allClients) {
      try {
        const u = new URL(client.url);
        if (u.origin === self.location.origin) {
          await client.focus();
          if ("navigate" in client) {
            try { await client.navigate(targetUrl); } catch (_) { /* cross-origin nav blocked */ }
          }
          return;
        }
      } catch (_) { /* ignore malformed URLs */ }
    }
    // Otherwise open a new window.
    if (self.clients.openWindow) {
      await self.clients.openWindow(targetUrl);
    }
  })());
});
