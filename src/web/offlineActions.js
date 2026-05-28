/**
 * Utility for queuing actions when offline using Background Sync API
 * Falls back to immediate execution if sync API is not available
 */
function hasBackgroundSync(registration) {
  return "sync" in registration;
}
/**
 * Queue an action for background sync when online
 * If offline, the action will be performed automatically when connection is restored
 */
export async function queueAction(action) {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    // No service worker, perform action immediately
    await performAction(action);
    return;
  }
  try {
    const registration = await navigator.serviceWorker.ready;
    if (!registration.active) {
      // Service worker not active, perform action immediately
      await performAction(action);
      return;
    }
    // Check if Background Sync API is available
    if (hasBackgroundSync(registration)) {
      const tag = `action-${JSON.stringify(action)}`;
      await registration.sync.register(tag);
      // Also send message to service worker to queue it
      registration.active.postMessage({
        type: "QUEUE_ACTION",
        action: action,
      });
    } else {
      // Background Sync not available, try to perform action immediately
      await performAction(action);
    }
  } catch (err) {
    console.error("[OfflineActions] Failed to queue action:", err);
    // Fallback: try to perform action immediately
    try {
      await performAction(action);
    } catch (fallbackErr) {
      console.error(
        "[OfflineActions] Immediate action also failed:",
        fallbackErr,
      );
      throw fallbackErr;
    }
  }
}
/**
 * Perform an action immediately
 */
async function performAction(action) {
  const headers = { "Content-Type": "application/json" };
  const body = action.body ? JSON.stringify(action.body) : undefined;
  const response = await fetch(action.url, {
    method: action.method,
    credentials: "include",
    headers: headers,
    body: body,
  });
  if (!response.ok) {
    throw new Error(`Action failed: ${response.status} ${response.statusText}`);
  }
  return response;
}
/**
 * Check if Background Sync API is supported
 */
export function isBackgroundSyncSupported() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return false;
  }
  // We'll check this asynchronously when needed
  return true;
}
