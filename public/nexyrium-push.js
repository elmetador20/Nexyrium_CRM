const inbox = "/settings/notifications";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function destination(value) {
  if (value === "/tasks") return value;
  if (typeof value !== "string") return inbox;
  const slash = value.lastIndexOf("/");
  const allowed = ["/expenses", "/projects", "/crm/leads", "/finance/invoices", "/quotations"];
  return allowed.includes(value.slice(0, slash)) && uuid.test(value.slice(slash + 1)) ? value : inbox;
}

self.addEventListener("push", event => {
  let message;
  try { message = event.data?.json(); } catch { /* Legacy or malformed wakeup. */ }
  const valid = uuid.test(message?.id) && typeof message.title === "string" &&
    message.title.trim().length > 0 && message.title.length <= 80 &&
    typeof message.body === "string" && message.body.trim().length > 0 && message.body.length <= 180;
  event.waitUntil(self.registration.showNotification(valid ? message.title : "Nexyrium", {
    body: valid ? message.body : "Open your inbox to view your notifications.",
    icon: "/branding/icons/icon-192.png",
    ...(valid ? { tag: message.id } : {}),
    data: { href: valid ? destination(message.href) : inbox },
  }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = new URL(destination(event.notification.data?.href), self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({type:"window",includeUncontrolled:true});
    const inbox = windows.find(client => client.url === url);
    if (inbox) return inbox.focus();
    return self.clients.openWindow(url);
  })());
});
