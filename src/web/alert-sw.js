/* Injected by server: __FIREBASE_CONFIG__ */
importScripts("https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js");
firebase.initializeApp(__FIREBASE_CONFIG__);
const messaging = firebase.messaging();

// Cache version - increment to force cache refresh
const CACHE_VERSION = "v1";
const STATIC_CACHE = "static-" + CACHE_VERSION;
const API_CACHE = "api-" + CACHE_VERSION;
const POLL_INTERVAL = 2 * 60 * 1000; // 2 minutes
const API_CACHE_MAX_AGE = 5 * 60 * 1000; // 5 minutes for API cache

// Helper functions
function getTimestampUrl(requestUrl) {
  return requestUrl + (requestUrl.includes("?") ? "&" : "?") + "__timestamp";
}

function broadcastToClients(message) {
  return self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clients) {
    clients.forEach(function (client) {
      client.postMessage(message);
    });
  });
}

function storeCacheWithTimestamp(cache, request, response, timestamp) {
  cache.put(request, response);
  var timestampUrl = getTimestampUrl(request.url);
  return cache.put(
    new Request(timestampUrl, { credentials: "include" }),
    new Response(JSON.stringify({ timestamp: timestamp }), {
      headers: { "Content-Type": "application/json" },
    })
  );
}

function checkCacheFreshness(cache, request) {
  return cache.match(request).then(function (cached) {
    if (!cached) {
      return Promise.resolve({ cached: null, isStale: true });
    }
    var timestampUrl = getTimestampUrl(request.url);
    return cache.match(new Request(timestampUrl, { credentials: "include" }))
      .then(function (timestampResponse) {
        if (timestampResponse) {
          return timestampResponse.json().then(function (data) {
            var age = Date.now() - (data.timestamp || 0);
            return { cached: cached, isStale: age > API_CACHE_MAX_AGE };
          });
        }
        return { cached: cached, isStale: true };
      })
      .catch(function () {
        return { cached: cached, isStale: true };
      });
  });
}

// Static assets to cache
const STATIC_ASSETS = [
  "/main.js",
  "/main.css",
  "/manifest.json",
  "/logo-192.png",
  "/logo-512.png",
  "/gray-192.png",
];

// Install: Cache static assets
self.addEventListener("install", function (event) {
  self.console.log("[SW] Installing, caching static assets");
  event.waitUntil(
    caches.open(STATIC_CACHE).then(function (cache) {
      return cache.addAll(STATIC_ASSETS).catch(function (err) {
        self.console.log("[SW] Cache addAll failed (some assets may not exist):", err);
      });
    })
  );
  self.skipWaiting(); // Activate immediately
});

// Unified polling: Fetch events and broadcast to all clients
let pollTimer = null;
let lastPollTime = 0;

function pollForEvents(force) {
  const now = Date.now();
  if (!force && now - lastPollTime < POLL_INTERVAL - 1000) return;
  lastPollTime = now;
  
  self.console.log("[SW] Polling for events");
  
  fetch("/events", { credentials: "include" })
    .then(function (response) {
      if (!response.ok) throw new Error("Failed to fetch events");
      // Cache the response for offline viewing
      const responseClone = response.clone();
      caches.open(API_CACHE).then(function (cache) {
        const cacheRequest = new Request("/events", { credentials: "include" });
        return storeCacheWithTimestamp(cache, cacheRequest, responseClone, now).catch(function (err) {
          self.console.log("[SW] Failed to cache events:", err);
        });
      });
      return response.json();
    })
    .then(function (data) {
      // Broadcast to all clients
      return broadcastToClients({
        type: "EVENTS_UPDATE",
        data: data,
      });
    })
    .catch(function (err) {
      self.console.log("[SW] Poll failed:", err);
      // Try to serve from cache if network fails
      caches.open(API_CACHE).then(function (cache) {
        return cache.match(new Request("/events", { credentials: "include" }));
      }).then(function (cached) {
        if (cached) {
          return cached.json();
        }
        throw new Error("No cached data available");
      }).then(function (data) {
        self.console.log("[SW] Serving cached events data");
        return broadcastToClients({
          type: "EVENTS_UPDATE",
          data: data,
        });
      }).catch(function () {
        // No cache available, that's okay
      });
    });
}

// Activate: Clean up old caches and start polling
self.addEventListener("activate", function (event) {
  self.console.log("[SW] Activating");
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then(function (cacheNames) {
        return Promise.all(
          cacheNames.map(function (cacheName) {
            if (cacheName !== STATIC_CACHE && cacheName !== API_CACHE && 
                (cacheName.startsWith("static-") || cacheName.startsWith("api-"))) {
              self.console.log("[SW] Deleting old cache:", cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Start polling
      (function () {
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(pollForEvents, POLL_INTERVAL);
        pollForEvents(); // Poll immediately
        return self.clients.claim(); // Take control of all pages immediately
      })(),
    ])
  );
});

// Fetch: Serve static assets and API responses from cache with stale-while-revalidate
self.addEventListener("fetch", function (event) {
  const url = new URL(event.request.url);
  
  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;
  
  // Skip timestamp requests (used for cache metadata)
  if (url.searchParams.has("__timestamp")) return;
  
  // Cache static assets (JS, CSS, images, manifest)
  if (url.pathname.match(/\.(js|css|png|jpg|svg|json)$/) || STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then(function (cached) {
        if (cached) {
          // Return cached version immediately, update in background
          fetch(event.request).then(function (response) {
            if (response.ok) {
              caches.open(STATIC_CACHE).then(function (cache) {
                cache.put(event.request, response.clone());
              });
            }
          }).catch(function () {
            // Network failed, cached version is fine
          });
          return cached;
        }
        // Not in cache, fetch and cache
        return fetch(event.request).then(function (response) {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(STATIC_CACHE).then(function (cache) {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        });
      })
    );
    return;
  }
  
  // Stale-while-revalidate for API responses (not /events – that must always be fresh for polling/badges)
  if (url.pathname.startsWith("/webhooks/") || url.pathname.startsWith("/settings/")) {
    // Clone the request since we might use it multiple times
    var requestClone = event.request.clone();
    event.respondWith(
      caches.open(API_CACHE).then(function (cache) {
        return checkCacheFreshness(cache, requestClone).then(function (result) {
          var cached = result.cached;
          var isStale = result.isStale;
          
          // Fetch fresh data (use original request, not clone)
          var fetchPromise = fetch(event.request, { credentials: "include" })
            .then(function (response) {
              if (response.ok) {
                var responseClone = response.clone();
                var now = Date.now();
                // Use requestClone for caching (same as freshness check)
                return storeCacheWithTimestamp(cache, requestClone, responseClone, now).then(function () {
                  return response;
                });
              }
              return response;
            })
            .catch(function (err) {
              self.console.log("[SW] Fetch failed:", err);
              // If we have cached data (even if stale), return it when fetch fails
              if (cached) return cached;
              throw err;
            });
          
          // If we have fresh cached data, return it immediately and update in background
          if (cached && !isStale) {
            // Update cache in background
            fetchPromise.catch(function () {
              // Ignore background update failures
            });
            return cached;
          }
          
          // Otherwise wait for fresh data (or return stale cache if fetch fails)
          return fetchPromise;
        });
      })
    );
  }
});


// Background Sync: Queue actions when offline, sync when online
self.addEventListener("sync", function (event) {
  if (event.tag.startsWith("action-")) {
    event.waitUntil(
      (function () {
        var actionData = event.tag.replace("action-", "");
        try {
          var parsed = JSON.parse(actionData);
          return performAction(parsed);
        } catch (err) {
          self.console.log("[SW] Failed to parse sync action:", err);
          return Promise.resolve();
        }
      })()
    );
  }
});

function performAction(action) {
  self.console.log("[SW] Performing background sync action:", action);
  
  var url = action.url;
  var method = action.method || "GET";
  var body = action.body ? JSON.stringify(action.body) : null;
  var headers = { "Content-Type": "application/json" };
  
  return fetch(url, {
    method: method,
    credentials: "include",
    headers: headers,
    body: body,
  })
    .then(function (response) {
      if (!response.ok) throw new Error("Action failed");
      // Notify clients of successful sync
      return broadcastToClients({
        type: "ACTION_SYNCED",
        action: action,
      });
    })
    .catch(function (err) {
      self.console.log("[SW] Background sync failed:", err);
      // Re-throw to retry the sync
      throw err;
    });
}

// Handle messages from clients (e.g., manual refresh requests, queue actions)
self.addEventListener("message", function (event) {
  if (event.data && event.data.type === "POLL_NOW") {
    pollForEvents(true);
  } else if (event.data && event.data.type === "QUEUE_ACTION") {
    // Queue an action for background sync
    var action = event.data.action;
    if (action && action.url) {
      var tag = "action-" + JSON.stringify(action);
      // Check if Background Sync API is available
      if (self.registration.sync) {
        self.registration.sync.register(tag).catch(function (err) {
          self.console.log("[SW] Failed to register sync:", err);
          // Fallback: try to perform action immediately if sync API not available
          performAction(action).catch(function () {
            // Ignore errors in fallback
          });
        });
      } else {
        // Background Sync not available, try to perform action immediately
        performAction(action).catch(function () {
          // Ignore errors in fallback
        });
      }
    }
  }
});

// Firebase Cloud Messaging
messaging.onBackgroundMessage(function (payload) {
  self.console.log("[FCM SW] onBackgroundMessage received", payload);
  const title = payload.notification?.title ?? payload.data?.title ?? "Alert";
  const body = payload.notification?.body ?? payload.data?.body ?? "";
  const options = { body, icon: "/logo-192.png", badge: "/gray-192.png", data: { url: "/" } };
  // When a push arrives, immediately poll for updated events and quota (bypass throttle)
  pollForEvents(true);
  return self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url.includes(self.location.origin) && "focus" in client) {
          // Use navigate if available, otherwise use focus
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
