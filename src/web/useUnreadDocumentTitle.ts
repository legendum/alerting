import { useCallback, useEffect, useState } from "react";
import { FAVICON_NO_UNREAD, FAVICON_UNREAD } from "./appIcons";
import { getAppName } from "./appName";
import { onEventsUpdate } from "./messages";
import { setFavicon } from "./setFavicon";

/** Poll `/api/alerts` for unread counts; sync title, favicon, and PWA badge. */
export function useUnreadDocumentTitle(unreadVersion: number) {
  const [totalUnread, setTotalUnread] = useState(0);

  const fetchUnread = useCallback(() => {
    fetch("/api/alerts", { credentials: "include" })
      .then((r) => r.json())
      .then((d: { total_unread?: number }) =>
        setTotalUnread(d.total_unread ?? 0),
      )
      .catch(() => setTotalUnread(0));
  }, []);

  useEffect(() => {
    fetchUnread();
  }, [unreadVersion, fetchUnread]);

  useEffect(() => {
    const unsubscribe = onEventsUpdate((data) => {
      if (typeof data.total_unread === "number") {
        setTotalUnread(data.total_unread);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const name = getAppName();
    document.title =
      totalUnread > 0
        ? `${name} (${totalUnread > 99 ? "99+" : totalUnread})`
        : name;

    setFavicon(totalUnread > 0 ? FAVICON_UNREAD : FAVICON_NO_UNREAD);

    if ("setAppBadge" in navigator) {
      if (totalUnread > 0) {
        navigator
          .setAppBadge(totalUnread > 99 ? 99 : totalUnread)
          .catch(() => {});
      } else {
        navigator.clearAppBadge().catch(() => {});
      }
    }
  }, [totalUnread]);

  return { totalUnread };
}
