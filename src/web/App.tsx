import { LoginScreen, useUser } from "pues/base/auth";
import { Pues } from "pues/base/core";
import { useResource } from "pues/base/objects";
import { useCallback, useEffect, useState } from "react";
import { getAppName } from "./appName";
import Inbox from "./components/Inbox";
import Settings from "./components/Settings";
import TopBar from "./components/TopBar";
import WebhookEvents from "./components/WebhookEvents";
import WebhooksList from "./components/WebhooksList";
import { setUnauthorizedHandler } from "./fetchWithAuth";
import { initEventsPolling, onEventsUpdate, requestPoll } from "./messages";
import { registerPushIfSupported } from "./pushRegistration";
import type { WebhookEntry } from "./types";

export type AlertingProfile = {
  email: string;
  timezone: string | null;
  quota_basic: number;
  quota_extra: number;
  mail_hour?: number;
};

type Screen = "webhooks" | "events" | "inbox" | "settings";

export default function App() {
  const { user: puesUser, loading: authLoading, setUser } = useUser();
  const [profile, setProfile] = useState<AlertingProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [screen, setScreen] = useState<Screen>("webhooks");
  const [selectedWebhookUlid, setSelectedWebhookUlid] = useState<string | null>(
    null,
  );
  const [unreadVersion, setUnreadVersion] = useState(0);
  const webhooksResource = useResource<WebhookEntry>("webhooks", {
    enabled: !!puesUser,
  });

  const ensureProfileWithTimezone = useCallback(
    async (data: AlertingProfile): Promise<AlertingProfile> => {
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
      return res2.ok ? ((await res2.json()) as AlertingProfile) : data;
    },
    [],
  );

  const fetchProfile = useCallback(async () => {
    setProfileLoading(true);
    try {
      const res = await fetch("/settings/me", { credentials: "include" });
      if (!res.ok) {
        setProfile(null);
        setUser(null);
        return;
      }
      const data = (await res.json()) as AlertingProfile;
      const finalProfile = await ensureProfileWithTimezone(data);
      setProfile(finalProfile);
    } catch {
      setProfile(null);
    } finally {
      setProfileLoading(false);
    }
  }, [ensureProfileWithTimezone, setUser]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setProfile(null);
    });
  }, [setUser]);

  useEffect(() => {
    if (!puesUser) {
      setProfile(null);
      return;
    }
    void fetchProfile();
  }, [puesUser, fetchProfile]);

  useEffect(() => {
    if (!puesUser && typeof document !== "undefined") {
      document.title = getAppName();
    }
  }, [puesUser]);

  useEffect(() => {
    if (puesUser && profile) registerPushIfSupported();
  }, [puesUser, profile]);

  useEffect(() => {
    initEventsPolling();
  }, []);

  useEffect(() => {
    const unsubscribe = onEventsUpdate(() => {
      if (puesUser) void fetchProfile();
    });
    return unsubscribe;
  }, [puesUser, fetchProfile]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (puesUser) void fetchProfile();
      requestPoll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [puesUser, fetchProfile]);

  const loading =
    authLoading || (!!puesUser && profileLoading && profile === null);

  return (
    <Pues user={loading ? undefined : puesUser}>
      {loading ? (
        <div
          style={{
            padding: 24,
            textAlign: "center",
            color: "var(--pues-text-secondary)",
          }}
        >
          Loading…
        </div>
      ) : !puesUser ? (
        <LoginScreen
          tagline="Get push notifications from your webhooks."
          logoSrc="/img/inbox-512.png"
        />
      ) : !profile ? (
        <div
          style={{
            padding: 24,
            textAlign: "center",
            color: "var(--pues-text-secondary)",
          }}
        >
          Loading…
        </div>
      ) : (
        <>
          {screen === "settings" ? (
            <>
              <TopBar
                user={profile}
                screen="settings"
                onNavigate={setScreen}
                unreadVersion={unreadVersion}
              />
              <Settings
                onBack={() => setScreen("webhooks")}
                email={profile.email}
                timezone={profile.timezone}
                onRefreshUser={fetchProfile}
              />
            </>
          ) : screen === "events" && selectedWebhookUlid ? (
            <>
              <TopBar
                user={profile}
                screen="webhooks"
                onNavigate={setScreen}
                unreadVersion={unreadVersion}
              />
              <WebhookEvents
                webhookUlid={selectedWebhookUlid}
                webhooksResource={webhooksResource}
                onBack={() => {
                  setScreen("webhooks");
                  setSelectedWebhookUlid(null);
                  setUnreadVersion((v) => v + 1);
                }}
                onEventsMarkedSeen={() => setUnreadVersion((v) => v + 1)}
              />
            </>
          ) : screen === "inbox" ? (
            <>
              <TopBar
                user={profile}
                screen="webhooks"
                onNavigate={setScreen}
                unreadVersion={unreadVersion}
              />
              <Inbox
                onBack={() => setScreen("webhooks")}
                onEventsMarkedSeen={() => setUnreadVersion((v) => v + 1)}
              />
            </>
          ) : (
            <>
              <TopBar
                user={profile}
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
                mailHour={profile.mail_hour}
              />
            </>
          )}
        </>
      )}
    </Pues>
  );
}
