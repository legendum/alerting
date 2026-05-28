import { useResource } from "pues/base/objects";
import { reconcileTheme } from "pues/base/theme";
import { useCallback, useEffect, useState } from "react";
import { getAppName } from "./appName";
import Inbox from "./components/Inbox";
import Login from "./components/Login";
import Settings from "./components/Settings";
import TopBar from "./components/TopBar";
import WebhookEvents from "./components/WebhookEvents";
import WebhooksList from "./components/WebhooksList";
import { setUnauthorizedHandler } from "./fetchWithAuth";
import { initEventsPolling, onEventsUpdate, requestPoll } from "./messages";
import { registerPushIfSupported } from "./pushRegistration";
import type { WebhookEntry } from "./types";

type User = {
  email: string;
  timezone: string | null;
  quota_basic: number;
  quota_extra: number;
  mail_hour?: number;
  meta?: { theme?: unknown };
};

type Screen = "webhooks" | "events" | "inbox" | "settings";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState<Screen>("webhooks");
  const [selectedWebhookUlid, setSelectedWebhookUlid] = useState<string | null>(
    null,
  );
  const [unreadVersion, setUnreadVersion] = useState(0);
  const webhooksResource = useResource<WebhookEntry>("webhooks", {
    enabled: !!user,
  });

  /** If user has no timezone, detect device timezone and PATCH; returns user to set. */
  const ensureUserWithTimezone = useCallback(
    async (data: User | null): Promise<User | null> => {
      if (!data) return null;
      if (data.timezone != null && data.timezone.trim() !== "") return data;
      const detected =
        typeof Intl !== "undefined"
          ? Intl.DateTimeFormat().resolvedOptions().timeZone
          : "UTC";
      await fetch("/settings/me", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: detected }),
      });
      const res2 = await fetch("/settings/me", { credentials: "include" });
      return res2.ok ? ((await res2.json()) as User) : data;
    },
    [],
  );

  const fetchUser = useCallback(async () => {
    const res = await fetch("/settings/me", { credentials: "include" });
    if (!res.ok) {
      setUser(null);
      return;
    }
    const data = (await res.json()) as User;
    const finalUser = await ensureUserWithTimezone(data);
    reconcileTheme(finalUser?.meta?.theme);
    setUser(finalUser);
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
    initEventsPolling();
  }, []);

  // Refresh user (and quota) when the events poll receives new data
  useEffect(() => {
    const unsubscribe = onEventsUpdate(() => {
      if (user) fetchUser();
    });
    return unsubscribe;
  }, [user, fetchUser]);

  // When tab becomes visible, refetch user and trigger events poll so badge/data stay in sync
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      fetchUser();
      requestPoll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [fetchUser]);

  if (loading) {
    return (
      <div
        style={{
          padding: 24,
          textAlign: "center",
          color: "var(--pues-text-secondary)",
        }}
      >
        Loading…
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  if (screen === "settings") {
    return (
      <>
        <TopBar
          user={user}
          screen="settings"
          onNavigate={setScreen}
          unreadVersion={unreadVersion}
        />
        <Settings
          onBack={() => setScreen("webhooks")}
          email={user.email}
          timezone={user.timezone}
          onRefreshUser={fetchUser}
        />
      </>
    );
  }

  if (screen === "events" && selectedWebhookUlid) {
    return (
      <>
        <TopBar
          user={user}
          screen="webhooks"
          onNavigate={setScreen}
          unreadVersion={unreadVersion}
        />
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
        <TopBar
          user={user}
          screen="webhooks"
          onNavigate={setScreen}
          unreadVersion={unreadVersion}
        />
        <Inbox
          onBack={() => setScreen("webhooks")}
          onEventsMarkedSeen={() => setUnreadVersion((v) => v + 1)}
        />
      </>
    );
  }

  return (
    <>
      <TopBar
        user={user}
        screen="webhooks"
        onNavigate={setScreen}
        unreadVersion={unreadVersion}
      />
      <WebhooksList
        resource={webhooksResource}
        onSelectWebhook={(ulid) => {
          setSelectedWebhookUlid(ulid);
          setScreen("events");
        }}
        mailHour={user.mail_hour}
      />
    </>
  );
}
