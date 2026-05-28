import { reconcileTheme } from "pues/base/theme";
import { useCallback, useEffect, useState } from "react";
import {
  Fragment as _Fragment,
  jsx as _jsx,
  jsxs as _jsxs,
} from "react/jsx-runtime";
import { getAppName } from "./appName";
import CreateWebhook from "./components/CreateWebhook";
import Inbox from "./components/Inbox";
import Login from "./components/Login";
import Settings from "./components/Settings";
import TopBar from "./components/TopBar";
import WebhookEvents from "./components/WebhookEvents";
import WebhooksList from "./components/WebhooksList";
import { setUnauthorizedHandler } from "./fetchWithAuth";
import { initEventsPolling, onEventsUpdate, requestPoll } from "./messages";
import { registerPushIfSupported } from "./pushRegistration";
export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState("webhooks");
  const [selectedWebhookUlid, setSelectedWebhookUlid] = useState(null);
  const [unreadVersion, setUnreadVersion] = useState(0);
  /** If user has no timezone, detect device timezone and PATCH; returns user to set. */
  const ensureUserWithTimezone = useCallback(async (data) => {
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
    return res2.ok ? await res2.json() : data;
  }, []);
  const fetchUser = useCallback(async () => {
    const res = await fetch("/settings/me", { credentials: "include" });
    if (!res.ok) {
      setUser(null);
      return;
    }
    const data = await res.json();
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
    return _jsx("div", {
      style: {
        padding: 24,
        textAlign: "center",
        color: "var(--pues-text-secondary)",
      },
      children: "Loading\u2026",
    });
  }
  if (!user) {
    return _jsx(Login, {});
  }
  if (screen === "settings") {
    return _jsxs(_Fragment, {
      children: [
        _jsx(TopBar, {
          user: user,
          screen: "settings",
          onNavigate: setScreen,
          onRefreshUser: fetchUser,
          unreadVersion: unreadVersion,
        }),
        _jsx(Settings, {
          onBack: () => setScreen("webhooks"),
          email: user.email,
          timezone: user.timezone,
          onRefreshUser: fetchUser,
        }),
      ],
    });
  }
  if (screen === "create") {
    return _jsxs(_Fragment, {
      children: [
        _jsx(TopBar, {
          user: user,
          screen: "webhooks",
          onNavigate: setScreen,
          onRefreshUser: fetchUser,
          unreadVersion: unreadVersion,
        }),
        _jsx(CreateWebhook, {
          onDone: () => {
            setScreen("webhooks");
            fetchUser();
          },
          onBack: () => setScreen("webhooks"),
        }),
      ],
    });
  }
  if (screen === "events" && selectedWebhookUlid) {
    return _jsxs(_Fragment, {
      children: [
        _jsx(TopBar, {
          user: user,
          screen: "webhooks",
          onNavigate: setScreen,
          onRefreshUser: fetchUser,
          unreadVersion: unreadVersion,
        }),
        _jsx(WebhookEvents, {
          webhookUlid: selectedWebhookUlid,
          onBack: () => {
            setScreen("webhooks");
            setSelectedWebhookUlid(null);
            setUnreadVersion((v) => v + 1);
          },
          onEventsMarkedSeen: () => setUnreadVersion((v) => v + 1),
        }),
      ],
    });
  }
  if (screen === "inbox") {
    return _jsxs(_Fragment, {
      children: [
        _jsx(TopBar, {
          user: user,
          screen: "webhooks",
          onNavigate: setScreen,
          onRefreshUser: fetchUser,
          unreadVersion: unreadVersion,
        }),
        _jsx(Inbox, {
          onBack: () => setScreen("webhooks"),
          onEventsMarkedSeen: () => setUnreadVersion((v) => v + 1),
        }),
      ],
    });
  }
  return _jsxs(_Fragment, {
    children: [
      _jsx(TopBar, {
        user: user,
        screen: "webhooks",
        onNavigate: setScreen,
        onRefreshUser: fetchUser,
        unreadVersion: unreadVersion,
      }),
      _jsx(WebhooksList, {
        onSelectWebhook: (ulid) => {
          setSelectedWebhookUlid(ulid);
          setScreen("events");
        },
        onAddWebhook: () => setScreen("create"),
        mailHour: user.mail_hour,
      }),
    ],
  });
}
