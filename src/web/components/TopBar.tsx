import React from "react";
import { getAppName } from "../appName";
import { onEventsUpdate } from "../messages";

type User = { email: string; quota_basic: number; quota_extra: number };
type Screen = "webhooks" | "settings";

type Props = {
  user: User;
  screen: Screen;
  onNavigate: (s: "webhooks" | "inbox" | "settings") => void;
  onRefreshUser: () => void;
  unreadVersion?: number;
};

export default function TopBar({ user, screen, onNavigate, onRefreshUser, unreadVersion = 0 }: Props) {
  const [totalUnread, setTotalUnread] = React.useState<number | null>(null);

  const fetchUnread = React.useCallback(() => {
    fetch("/events", { credentials: "include" })
      .then((r) => r.json())
      .then((d: { total_unread?: number }) => setTotalUnread(d.total_unread ?? 0))
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
    document.title = totalUnread > 0 ? `${name} (${totalUnread > 99 ? "99+" : totalUnread})` : name;

    // Update favicon for web page
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (link) link.href = totalUnread > 0 ? "/img/red-ball-192.png" : "/img/gray-ball-192.png";

    // Update PWA badge (for installed PWA)
    if ("setAppBadge" in navigator) {
      if (totalUnread > 0) {
        navigator.setAppBadge(totalUnread > 99 ? 99 : totalUnread).catch(() => {});
      } else {
        navigator.clearAppBadge().catch(() => {});
      }
    }
  }, [totalUnread]);

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button
          type="button"
          className="icon-btn"
          onClick={() => onNavigate("inbox")}
          title="Inbox"
        >
          📥
          {totalUnread > 0 && (
            <span className="badge" style={{ marginLeft: 4 }}>
              {totalUnread > 99 ? "99+" : totalUnread}
            </span>
          )}
        </button>
      </div>
      <div className="topbar-center">
        <a
          href="/quota"
          className={`quota-badge${(user.quota_basic + user.quota_extra) < 20 ? " quota-badge--low" : ""}`}
          style={{ textDecoration: "none" }}
        >
          Quota: {user.quota_basic + user.quota_extra}
        </a>
      </div>
      <div className="topbar-right">
        <button
          type="button"
          className="icon-btn"
          onClick={() => onNavigate("settings")}
          title="Settings"
        >
          ⚙️
        </button>
      </div>
    </header>
  );
}
