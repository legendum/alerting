import { useCallback, useEffect, useState } from "react";
import { getAppName } from "./appName";
import { onEventsUpdate } from "./messages";

/** Poll `/alerts` for unread counts; sync document title and PWA badge. */
export function useUnreadDocumentTitle(unreadVersion: number) {
  const [totalUnread, setTotalUnread] = useState(0);

  const fetchUnread = useCallback(() => {
    fetch("/alerts", { credentials: "include" })
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
