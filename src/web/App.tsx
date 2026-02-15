import React, { useState, useEffect, useCallback } from "react";
import { getAppName } from "./appName";
import Login from "./components/Login";
import TopBar from "./components/TopBar";
import WebhooksList from "./components/WebhooksList";
import WebhookEvents from "./components/WebhookEvents";
import Inbox from "./components/Inbox";
import Settings from "./components/Settings";
import CreateWebhook from "./components/CreateWebhook";

type User = {
  email: string;
  timezone: string | null;
  quota_basic: number;
  quota_extra: number;
};

type Screen = "webhooks" | "events" | "inbox" | "settings" | "create";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState<Screen>("webhooks");
  const [selectedWebhookUlid, setSelectedWebhookUlid] = useState<string | null>(null);
  const [unreadVersion, setUnreadVersion] = useState(0);

  /** If user has no timezone, detect device timezone and PATCH; returns user to set. */
  const ensureUserWithTimezone = useCallback(async (data: User | null): Promise<User | null> => {
    if (!data) return null;
    if (data.timezone != null && data.timezone.trim() !== "") return data;
    const detected = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";
    await fetch("/settings/me", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezone: detected }),
    });
    const res2 = await fetch("/settings/me", { credentials: "include" });
    return res2.ok ? ((await res2.json()) as User) : data;
  }, []);

  const fetchUser = useCallback(async () => {
    const res = await fetch("/settings/me", { credentials: "include" });
    if (!res.ok) {
      setUser(null);
      return;
    }
    const data = (await res.json()) as User;
    setUser(await ensureUserWithTimezone(data));
  }, [ensureUserWithTimezone]);

  useEffect(() => {
    fetch("/settings/me", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: User | null) => ensureUserWithTimezone(data))
      .then((user) => {
        setUser(user);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [ensureUserWithTimezone]);

  useEffect(() => {
    if (!user && typeof document !== "undefined") document.title = getAppName();
  }, [user]);

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "#94a3b8" }}>
        Loading…
      </div>
    );
  }

  if (!user) {
    const signupMode = typeof window !== "undefined" && window.location.hash === "#signup";
    return <Login onLogin={fetchUser} initialMode={signupMode ? "signup" : "login"} />;
  }

  if (screen === "settings") {
    return (
      <>
        <TopBar
          user={user}
          screen="settings"
          onNavigate={setScreen}
          onRefreshUser={fetchUser}
          unreadVersion={unreadVersion}
        />
        <Settings
          onBack={() => setScreen("webhooks")}
          timezone={user.timezone}
          onRefreshUser={fetchUser}
        />
      </>
    );
  }

  if (screen === "create") {
    return (
      <>
        <TopBar user={user} screen="webhooks" onNavigate={setScreen} onRefreshUser={fetchUser} unreadVersion={unreadVersion} />
        <CreateWebhook
          onDone={() => {
            setScreen("webhooks");
            fetchUser();
          }}
          onBack={() => setScreen("webhooks")}
        />
      </>
    );
  }

  if (screen === "events" && selectedWebhookUlid) {
    return (
      <>
        <TopBar user={user} screen="webhooks" onNavigate={setScreen} onRefreshUser={fetchUser} unreadVersion={unreadVersion} />
        <WebhookEvents
          webhookUlid={selectedWebhookUlid}
          onBack={() => {
            setScreen("webhooks");
            setSelectedWebhookUlid(null);
            setUnreadVersion((v) => v + 1);
          }}
          onEventsMarkedSeen={() => setUnreadVersion((v) => v + 1)}
        />
      </>
    );
  }

  if (screen === "inbox") {
    return (
      <>
        <TopBar user={user} screen="webhooks" onNavigate={setScreen} onRefreshUser={fetchUser} unreadVersion={unreadVersion} />
        <Inbox onBack={() => setScreen("webhooks")} />
      </>
    );
  }

  return (
    <>
      <TopBar user={user} screen="webhooks" onNavigate={setScreen} onRefreshUser={fetchUser} unreadVersion={unreadVersion} />
      <WebhooksList
        onSelectWebhook={(ulid) => {
          setSelectedWebhookUlid(ulid);
          setScreen("events");
        }}
        onAddWebhook={() => setScreen("create")}
        onRefreshUser={fetchUser}
      />
    </>
  );
}
