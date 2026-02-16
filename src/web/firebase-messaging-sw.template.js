/* Injected by server: __FIREBASE_CONFIG__ */
importScripts("https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js");
firebase.initializeApp(__FIREBASE_CONFIG__);
const messaging = firebase.messaging();
messaging.onBackgroundMessage(function (payload) {
  self.console.log("[FCM SW] onBackgroundMessage received", payload);
  const title = payload.notification?.title ?? payload.data?.title ?? "Alert";
  const body = payload.notification?.body ?? payload.data?.body ?? "";
  const options = { body, icon: "/logo-192.png", badge: "/gray-192.png", data: { url: "/" } };
  return self.registration.showNotification(title, options);
});
self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
    for (var i = 0; i < clientList.length; i++) {
      if (clientList[i].url.includes(self.location.origin) && "focus" in clientList[i]) {
        clientList[i].navigate(url);
        return clientList[i].focus();
      }
    }
    if (clients.openWindow) return clients.openWindow(url);
  }));
});
