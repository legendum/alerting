/**
 * App name from server-injected data-app-name (set from config/alerting.yaml app_name).
 * Fallback "Alerting.app" for SSR or when not yet injected.
 */
export function getAppName() {
  if (typeof document === "undefined") return "Alerting.app";
  const name = document.documentElement.getAttribute("data-app-name");
  return name?.trim() || "Alerting.app";
}
