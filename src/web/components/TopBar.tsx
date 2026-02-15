import React from "react";
import { getAppName } from "../appName";

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

  React.useEffect(() => {
    const interval = setInterval(fetchUnread, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchUnread]);

  React.useEffect(() => {
    if (totalUnread === null) return;
    const name = getAppName();
    document.title = totalUnread > 0 ? `${name} (${totalUnread > 99 ? "99+" : totalUnread})` : name;
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (link) link.href = totalUnread > 0 ? "/logo-192.png" : "/gray-192.png";
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
          className={`quota-badge${user.quota_basic < 20 ? " quota-badge--low" : ""}`}
          style={{ textDecoration: "none" }}
        >
          Quota: {user.quota_basic}
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
