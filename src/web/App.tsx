import React, { useState, useEffect, useCallback } from "react";
import { getAppName } from "./appName";
import { registerPushIfSupported } from "./pushRegistration";
import { initServiceWorkerMessages, onEventsUpdate } from "./swMessages";
import { setUnauthorizedHandler } from "./fetchWithAuth";
import Login from "./components/Login";
import TopBar from "./components/TopBar";
import WebhooksList from "./components/WebhooksList";
import WebhookEvents from "./components/WebhookEvents";
import Inbox from "./components/Inbox";
import Settings from "./components/Settings";
import CreateWebhook from "./components/CreateWebhook";

type User = {
  email: string;
  email_new?: string;
  timezone: string | null;
  quota_basic: number;
  quota_extra: number;
  mail_hour?: number;
};

type Screen = "webhooks" | "events" | "inbox" | "settings" | "create";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState<Screen>("webhooks");
  const [selectedWebhookUlid, setSelectedWebhookUlid] = useState<string | null>(null);
  const [unreadVersion, setUnreadVersion] = useState(0);
  const [redirectMessage, setRedirectMessage] = useState<string | null>(null);

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

  // Set up unauthorized handler to clear user state when 401 is received
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
    });
  }, []);

  useEffect(() => {
    fetchUser().finally(() => setLoading(false));
  }, [fetchUser]);

  useEffect(() => {
    if (!user && typeof document !== "undefined") document.title = getAppName();
  }, [user]);

  useEffect(() => {
    if (user) registerPushIfSupported();
  }, [user]);

  useEffect(() => {
    initServiceWorkerMessages();
  }, []);

  // Refresh user (and quota) when the service worker pushes new events
  useEffect(() => {
    const unsubscribe = onEventsUpdate(() => {
      if (user) fetchUser();
    });
    return unsubscribe;
  }, [user, fetchUser]);

  // When tab becomes visible again (e.g. user logged in via magic link in another tab), refetch so this tab sees it
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchUser();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [fetchUser]);

  // Handle confirm-email redirect params
  useEffect(() => {
    if (!user || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const confirmed = params.get("email_confirmed");
    const invalid = params.get("email_confirm");
    if (confirmed === "1") {
      const u = new URL(window.location.href);
      u.searchParams.delete("email_confirmed");
      window.history.replaceState(null, "", u.pathname + u.search);
      fetchUser();
      setRedirectMessage("Email updated successfully.");
      const t = setTimeout(() => setRedirectMessage(null), 5000);
      return () => clearTimeout(t);
    }
    if (invalid === "invalid") {
      const u = new URL(window.location.href);
      u.searchParams.delete("email_confirm");
      window.history.replaceState(null, "", u.pathname + u.search);
      setRedirectMessage("Confirmation link expired or invalid.");
      const t = setTimeout(() => setRedirectMessage(null), 6000);
      return () => clearTimeout(t);
    }
  }, [user, fetchUser]);

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "#94a3b8" }}>
        Loading…
      </div>
    );
  }

  if (!user) {
    return <Login onLogin={fetchUser} />;
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
          email={user.email}
          email_new={user.email_new}
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
        <Inbox onBack={() => setScreen("webhooks")} onEventsMarkedSeen={() => setUnreadVersion((v) => v + 1)} />
      </>
    );
  }

  return (
    <>
      <TopBar user={user} screen="webhooks" onNavigate={setScreen} onRefreshUser={fetchUser} unreadVersion={unreadVersion} />
      {redirectMessage && (
        <div style={{ padding: "8px 16px", fontSize: 13, color: "#e2e8f0", backgroundColor: "#334155", textAlign: "center" }}>
          {redirectMessage}
        </div>
      )}
      <WebhooksList
        onSelectWebhook={(ulid) => {
          setSelectedWebhookUlid(ulid);
          setScreen("events");
        }}
        onAddWebhook={() => setScreen("create")}
        onRefreshUser={fetchUser}
        mailHour={user.mail_hour}
      />
    </>
  );
}
