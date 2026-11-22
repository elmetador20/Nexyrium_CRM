self.addEventListener("push", event => {
  event.waitUntil(self.registration.showNotification("Nexyrium", {
    body: "Open your inbox to view your notifications.", icon: "/icons/icon-192.png", tag: "nexyrium-inbox"
  }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = new URL("/settings/notifications", self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({type:"window",includeUncontrolled:true});
    const inbox = windows.find(client => client.url === url);
    if (inbox) return inbox.focus();
    return self.clients.openWindow(url);
  })());
});
