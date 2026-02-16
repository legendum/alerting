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
  type: "EVENTS_UPDATE" | "ACTION_SYNCED";
  data?: EventsUpdateData;
  action?: { url: string; method: string; body?: unknown };
};

type EventsUpdateCallback = (data: EventsUpdateData) => void;
type ActionSyncedCallback = (action: { url: string; method: string; body?: unknown }) => void;

let messageListeners: Set<EventsUpdateCallback> = new Set();
let actionSyncedListeners: Set<ActionSyncedCallback> = new Set();
let swRegistration: ServiceWorkerRegistration | null = null;

/**
 * Initialize service worker message handling
 */
export function initServiceWorkerMessages(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  navigator.serviceWorker.ready.then((registration) => {
    swRegistration = registration;
  });

  navigator.serviceWorker.addEventListener("message", (event: MessageEvent<ServiceWorkerMessage>) => {
    if (event.data?.type === "EVENTS_UPDATE") {
      // Broadcast to all listeners
      messageListeners.forEach((callback) => {
        try {
          callback(event.data.data!);
        } catch (err) {
          console.error("[SW Messages] Callback error:", err);
        }
      });
    } else if (event.data?.type === "ACTION_SYNCED") {
      // Broadcast action synced to all listeners
      if (event.data.action) {
        actionSyncedListeners.forEach((callback) => {
          try {
            callback(event.data.action!);
          } catch (err) {
            console.error("[SW Messages] Action synced callback error:", err);
          }
        });
      }
    }
  });
}

/**
 * Subscribe to events updates from service worker
 * Returns unsubscribe function
 */
export function onEventsUpdate(callback: EventsUpdateCallback): () => void {
  messageListeners.add(callback);
  return () => {
    messageListeners.delete(callback);
  };
}

/**
 * Request immediate poll from service worker
 */
export function requestPoll(): void {
  if (swRegistration?.active) {
    swRegistration.active.postMessage({ type: "POLL_NOW" });
  }
}

/**
 * Subscribe to action synced events from service worker
 * Returns unsubscribe function
 */
export function onActionSynced(callback: ActionSyncedCallback): () => void {
  actionSyncedListeners.add(callback);
  return () => {
    actionSyncedListeners.delete(callback);
  };
}
