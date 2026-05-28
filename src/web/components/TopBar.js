import React from "react";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { getAppName } from "../appName";
import { onEventsUpdate } from "../messages";
export default function TopBar({
  user,
  screen,
  onNavigate,
  onRefreshUser,
  unreadVersion = 0,
}) {
  const [totalUnread, setTotalUnread] = React.useState(null);
  const unreadCount = totalUnread ?? 0;
  const fetchUnread = React.useCallback(() => {
    fetch("/alerts", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setTotalUnread(d.total_unread ?? 0))
      .catch(() => setTotalUnread(0));
  }, []);
  React.useEffect(() => {
    fetchUnread();
  }, [screen, unreadVersion, fetchUnread]);
  // Listen for events updates from poll
  React.useEffect(() => {
    const unsubscribe = onEventsUpdate((data) => {
      if (typeof data.total_unread === "number") {
        setTotalUnread(data.total_unread);
      }
    });
    return unsubscribe;
  }, []);
  React.useEffect(() => {
    if (totalUnread === null) return;
    const name = getAppName();
    document.title =
      totalUnread > 0
        ? `${name} (${totalUnread > 99 ? "99+" : totalUnread})`
        : name;
    // Update PWA badge (for installed PWA)
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
  return _jsxs("header", {
    className: "topbar",
    children: [
      _jsx("div", {
        className: "topbar-left",
        children: _jsxs("button", {
          type: "button",
          className: "icon-btn",
          onClick: () => onNavigate("inbox"),
          title: "Inbox",
          children: [
            "\uD83D\uDCE5",
            unreadCount > 0 &&
              _jsx("span", {
                className: "badge",
                style: { marginLeft: 4 },
                children: unreadCount > 99 ? "99+" : unreadCount,
              }),
          ],
        }),
      }),
      _jsx("div", {
        className: "topbar-center",
        children: _jsxs("a", {
          href: "/quota",
          className: `quota-badge${(user.quota_basic + user.quota_extra) < 20 ? " quota-badge--low" : ""}`,
          style: { textDecoration: "none" },
          children: ["Quota: ", user.quota_basic + user.quota_extra],
        }),
      }),
      _jsx("div", {
        className: "topbar-right",
        children: _jsx("button", {
          type: "button",
          className: "icon-btn",
          onClick: () => onNavigate("settings"),
          title: "Settings",
          children: "\u2699\uFE0F",
        }),
      }),
    ],
  });
}
