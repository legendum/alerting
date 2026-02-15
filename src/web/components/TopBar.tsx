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
  const [totalUnread, setTotalUnread] = React.useState(0);

  React.useEffect(() => {
    fetch("/events", { credentials: "include" })
      .then((r) => r.json())
      .then((d: { total_unread?: number }) => setTotalUnread(d.total_unread ?? 0))
      .catch(() => {});
  }, [screen, unreadVersion]);

  React.useEffect(() => {
    const name = getAppName();
    document.title = totalUnread > 0 ? `${name} (${totalUnread > 99 ? "99+" : totalUnread})` : name;
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
        <a href="/quota" className="quota-badge" style={{ textDecoration: "none", color: "inherit" }}>
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
