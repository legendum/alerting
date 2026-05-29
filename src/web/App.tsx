import { LoginScreen, useUser } from "pues/base/auth";
import { Pues } from "pues/base/core";
import { useFilterQuery, useResource } from "pues/base/objects";
import { useCallback, useEffect, useRef, useState } from "react";
import { getAppName } from "./appName";
import Inbox from "./components/Inbox";
import SettingsDialog from "./components/Settings";
import TopBar from "./components/TopBar";
import WebhookEvents from "./components/WebhookEvents";
import WebhooksList from "./components/WebhooksList";
import { setUnauthorizedHandler } from "./fetchWithAuth";
import { initEventsPolling, onEventsUpdate, requestPoll } from "./messages";
import { registerPushIfSupported } from "./pushRegistration";
import type { WebhookEntry } from "./types";
import { useUnreadDocumentTitle } from "./useUnreadDocumentTitle";

export type AlertingProfile = {
  email: string;
  timezone: string | null;
  quota_basic: number;
  quota_extra: number;
  quota_reset?: number | null;
  mail_hour?: number;
};

type Screen = "webhooks" | "events" | "inbox";

export default function App() {
  const { user: puesUser, loading: authLoading, setUser } = useUser();
  const [profile, setProfile] = useState<AlertingProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [screen, setScreen] = useState<Screen>("webhooks");
  const [selectedWebhookUlid, setSelectedWebhookUlid] = useState<string | null>(
    null,
  );
  const [unreadVersion, setUnreadVersion] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const filterInputRef = useRef<HTMLInputElement>(null);
  const { totalUnread } = useUnreadDocumentTitle(unreadVersion);

  const webhooksResource = useResource<WebhookEntry>("webhooks", {
    enabled: !!puesUser,
  });

  const filterSelectionKey =
    screen === "webhooks"
      ? null
      : screen === "inbox"
        ? "inbox"
        : selectedWebhookUlid;
  const [filterQuery, setFilterQuery] = useFilterQuery(filterSelectionKey);

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
  const homeHidden = screen !== "webhooks";

  return (
    <Pues user={loading ? undefined : puesUser}>
      {loading ? (
        <p className="screen-loading">Loading…</p>
      ) : !puesUser ? (
        <LoginScreen
          tagline="Get push notifications from your webhooks."
          logoSrc="/img/inbox-512.png"
        />
      ) : !profile ? (
        <p className="screen-loading">Loading…</p>
      ) : (
        <>
          <TopBar
            filterQuery={filterQuery}
            setFilterQuery={setFilterQuery}
            filterInputRef={filterInputRef}
            filterTargetsAlerts={screen !== "webhooks"}
            onOpenSettings={() => setSettingsOpen(true)}
          />
          <div className={homeHidden ? "app-root-panel--hidden" : undefined}>
            <WebhooksList
              resource={webhooksResource}
              filterQuery={filterQuery}
              totalUnread={totalUnread}
              onSelectInbox={() => setScreen("inbox")}
              onSelectWebhook={(ulid) => {
                setSelectedWebhookUlid(ulid);
                setScreen("events");
              }}
              mailHour={profile.mail_hour}
            />
          </div>
          {screen === "events" && selectedWebhookUlid ? (
            <WebhookEvents
              key={selectedWebhookUlid}
              webhookUlid={selectedWebhookUlid}
              webhooksResource={webhooksResource}
              filterQuery={filterQuery}
              profileTimezone={profile.timezone}
              onBack={() => {
                setScreen("webhooks");
                setSelectedWebhookUlid(null);
                setUnreadVersion((v) => v + 1);
              }}
              onEventsMarkedSeen={() => setUnreadVersion((v) => v + 1)}
            />
          ) : null}
          {screen === "inbox" ? (
            <Inbox
              filterQuery={filterQuery}
              profileTimezone={profile.timezone}
              onBack={() => setScreen("webhooks")}
              onEventsMarkedSeen={() => setUnreadVersion((v) => v + 1)}
            />
          ) : null}
          {settingsOpen ? (
            <SettingsDialog
              onClose={() => setSettingsOpen(false)}
              profile={profile}
              onRefreshUser={fetchProfile}
            />
          ) : null}
        </>
      )}
    </Pues>
  );
}
