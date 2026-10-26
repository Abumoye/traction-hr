// Service worker: shows phone alerts (Web Push) when the app is closed, with vibration and the phone's notification sound,
// and opens the right page when one is tapped. It stores nothing and does not cache or change any page.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data ? event.data.text() : "" }; }
  const title = data.title || "Traction Outsourcing HRMS";
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || "",
    icon: "assets/img/icon-192.png",
    badge: "assets/img/badge-96.png",
    tag: data.id || "tol-alert",   // the same alert shown twice replaces itself instead of piling up
    renotify: true,                // ...but still buzzes
    vibrate: [200, 100, 200],
    silent: false,                 // use the phone's notification sound
    timestamp: Date.now(),
    data: { url: data.url || "notifications.html" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "notifications.html", self.registration.scope).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of windows) {
      if (w.url.startsWith(self.registration.scope) && "focus" in w) {
        await w.focus();
        try { await w.navigate(target); } catch (e) { /* some browsers cannot; the page is in front at least */ }
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});
