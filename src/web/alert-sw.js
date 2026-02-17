/* Injected by server: __FIREBASE_CONFIG__ */
importScripts("https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js");
firebase.initializeApp(__FIREBASE_CONFIG__);
const messaging = firebase.messaging();

// Cache version - increment to force cache refresh
const CACHE_VERSION = "v1";
const STATIC_CACHE = "static-" + CACHE_VERSION;
const POLL_INTERVAL = 90 * 1000; // 90 seconds

function broadcastToClients(message) {
  return self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    clients.forEach((client) => {
      client.postMessage(message);
    });
  });
}

// Static assets to cache
const STATIC_ASSETS = [
  "/main.js",
  "/main.css",
  "/manifest.json",
  "/img/logo-192.png",
  "/img/logo-512.png",
  "/img/gray-192.png",
  "/img/gray-512.png",
];

self.addEventListener("install", (event) => {
  self.console.log("[SW] Installing, caching static assets");
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        self.console.log("[SW] Cache addAll failed (some assets may not exist):", err);
      });
    })
  );
  self.skipWaiting();
});

let pollTimer = null;
let lastPollTime = 0;

function pollForEvents(skipThrottle) {
  const now = Date.now();
  if (!skipThrottle && now - lastPollTime < POLL_INTERVAL - 1000) return;
  lastPollTime = now;

  self.console.log("[SW] Polling for events");

  fetch("/events", { credentials: "include" })
    .then((response) => {
      if (!response.ok) throw new Error("Failed to fetch events");
      return response.json();
    })
    .then((data) => {
      return broadcastToClients({
        type: "EVENTS_UPDATE",
        data: data,
      });
    })
    .catch((err) => {
      self.console.log("[SW] Poll failed:", err);
    });
}

self.addEventListener("activate", (event) => {
  self.console.log("[SW] Activating");
  event.waitUntil(
    Promise.all([
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE && cacheName.startsWith("static-")) {
              self.console.log("[SW] Deleting old cache:", cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      Promise.resolve().then(() => {
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(pollForEvents, POLL_INTERVAL);
        pollForEvents();
        return self.clients.claim();
      }),
    ])
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.match(/\.(js|css|png|jpg|svg|json)$/) || STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) {
          // Update cache in background
          fetch(event.request).then((response) => {
            if (response.ok) {
              caches.open(STATIC_CACHE).then((cache) => {
                cache.put(event.request, response.clone());
              });
            }
          }).catch(() => {});
          return cached;
        }
        // Fetch and cache
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => {
              cache.put(event.request, clone);
            });
          }
          return response;
        });
      })
    );
  }
});

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
          throw err; // Re-throw so Background Sync retries
        })
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
      throw err; // Re-throw to retry the sync
    });
}

// Handle messages from clients
self.addEventListener("message", (event) => {
  if (event.data?.type === "POLL_NOW") {
    pollForEvents(true);
  } else if (event.data?.type === "QUEUE_ACTION") {
    const action = event.data.action;
    if (action?.url) {
      const tag = "action-" + JSON.stringify(action);
      if (self.registration.sync) {
        self.registration.sync.register(tag).catch(() => {
          // Fallback: perform immediately if sync API unavailable
          performAction(action).catch(() => {});
        });
      } else {
        // Background Sync not available, perform immediately
        performAction(action).catch(() => {});
      }
    }
  }
});

messaging.onBackgroundMessage((payload) => {
  self.console.log("[FCM SW] onBackgroundMessage received", payload);
  const title = payload.notification?.title ?? payload.data?.title ?? "Alert";
  const body = payload.notification?.body ?? payload.data?.body ?? "";
  const options = { body, icon: "/img/logo-192.png", badge: "/img/gray-192.png", data: { url: "/" } };
  pollForEvents(true); // Immediately poll for updated events/quota
  return self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          if ("navigate" in client && typeof client.navigate === "function") {
            client.navigate(url);
          }
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
