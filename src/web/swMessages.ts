/**
 * Service Worker message handling utilities
 * Handles communication between the app and service worker for unified polling
 */

type EventsUpdateData = {
  events?: unknown[];
  total_unread?: number;
  unread_by_webhook?: Record<string, number>;
  has_more?: boolean;
};

type ServiceWorkerMessage = {
  type: "EVENTS_UPDATE";
  data?: EventsUpdateData;
};

type EventsUpdateCallback = (data: EventsUpdateData) => void;

let messageListeners: Set<EventsUpdateCallback> = new Set();

/**
 * Initialize service worker message handling
 */
export function initServiceWorkerMessages(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  navigator.serviceWorker.addEventListener("message", (event: MessageEvent<ServiceWorkerMessage>) => {
    if (event.data?.type === "EVENTS_UPDATE") {
      console.log("[Poll] Events update received", event.data.data);
      messageListeners.forEach((callback) => {
        try {
          callback(event.data.data!);
        } catch (err) {
          console.error("[SW Messages] Callback error:", err);
        }
      });
    }
  });
}

/**
 * Subscribe to events updates from service worker. Returns an unsubscribe function.
 */
export function onEventsUpdate(callback: EventsUpdateCallback): () => void {
  messageListeners.add(callback);
  return () => {
    messageListeners.delete(callback);
  };
}
