/* Injected by server: __FIREBASE_CONFIG__ (object or null) */
const FIREBASE_CONFIG = __FIREBASE_CONFIG__;

if (FIREBASE_CONFIG) {
  importScripts(
    "https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js",
  );
  importScripts(
    "https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js",
  );
  firebase.initializeApp(FIREBASE_CONFIG);
  firebase.messaging().onBackgroundMessage((payload) => {
    self.console.log("[FCM SW] onBackgroundMessage received", payload);
    const title = payload.notification?.title ?? payload.data?.title ?? "Alert";
    const body = payload.notification?.body ?? payload.data?.body ?? "";
    return self.registration.showNotification(title, {
      body,
      icon: "/red-ball.png",
      badge: "/red-ball.png",
      data: { url: "/" },
    });
  });
}

self.addEventListener("sync", (event) => {
  if (event.tag.startsWith("action-")) {
    event.waitUntil(
      Promise.resolve()
        .then(() => {
          const actionData = event.tag.replace("action-", "");
          return JSON.parse(actionData);
        })
        .then((action) => performAction(action))
        .catch((err) => {
          self.console.log("[SW] Failed to process sync action:", err);
          throw err;
        }),
    );
  }
});

function performAction(action) {
  self.console.log("[SW] Performing background sync action:", action);
  return fetch(action.url, {
    method: action.method || "GET",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: action.body ? JSON.stringify(action.body) : null,
  })
    .then((response) => {
      if (!response.ok) throw new Error("Action failed");
    })
    .catch((err) => {
      self.console.log("[SW] Background sync failed:", err);
      throw err;
    });
}

self.addEventListener("message", (event) => {
  if (event.data?.type === "QUEUE_ACTION") {
    const action = event.data.action;
    if (action?.url) {
      const tag = `action-${JSON.stringify(action)}`;
      if (self.registration.sync) {
        self.registration.sync.register(tag).catch(() => {
          performAction(action).catch(() => {});
        });
      } else {
        performAction(action).catch(() => {});
      }
    }
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            if ("navigate" in client && typeof client.navigate === "function") {
              client.navigate(url);
            }
            return client.focus();
          }
        }
        if (clients.openWindow) return clients.openWindow(url);
      }),
  );
});
