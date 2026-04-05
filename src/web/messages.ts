/**
 * Events polling utilities
 * Simple in-app polling (no service-worker-based polling).
 */

type EventsUpdateData = {
  events?: unknown[];
  total_unread?: number;
  unread_by_webhook?: Record<string, number>;
  has_more?: boolean;
};

type EventsUpdateCallback = (data: EventsUpdateData) => void;

const eventsUpdateListeners: Set<EventsUpdateCallback> = new Set();
let initialized = false;
const POLL_INTERVAL_MS = 90 * 1000; // 90 seconds
let _pollTimer: number | undefined;

async function pollOnce(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const res = await fetch("/alerts", { credentials: "include" });
    if (!res.ok) return;
    const data = (await res.json()) as EventsUpdateData;
    eventsUpdateListeners.forEach((callback) => {
      try {
        callback(data);
      } catch (err) {
        console.error("[Events Poll] Callback error:", err);
      }
    });
  } catch (err) {
    console.error("[Events Poll] Failed to fetch events:", err);
  }
}

/**
 * Initialize events polling (idempotent).
 */
export function initEventsPolling(): void {
  if (initialized) return;
  if (typeof window === "undefined") return;
  initialized = true;

  // Initial poll + interval
  void pollOnce();
  _pollTimer = window.setInterval(() => {
    void pollOnce();
  }, POLL_INTERVAL_MS);
}

/**
 * Subscribe to events updates. Returns an unsubscribe function.
 */
export function onEventsUpdate(callback: EventsUpdateCallback): () => void {
  eventsUpdateListeners.add(callback);
  return () => {
    eventsUpdateListeners.delete(callback);
  };
}

/**
 * Request an immediate poll (e.g. when FCM message received in foreground).
 */
export function requestPoll(): void {
  void pollOnce();
}
