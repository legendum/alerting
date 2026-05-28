/**
 * App name from server-injected data-app-name (set from config/alert.yaml app_name).
 * Fallback "Alert" for SSR or when not yet injected.
 */
export function getAppName() {
  if (typeof document === "undefined") return "Alert";
  const name = document.documentElement.getAttribute("data-app-name");
  return name?.trim() || "Alert";
}
