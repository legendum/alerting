import { useEffect, useState } from "react";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";

const TIMEZONES =
  typeof Intl !== "undefined" && typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone").sort()
    : [
        "UTC",
        "America/New_York",
        "America/Los_Angeles",
        "Europe/London",
        "Europe/Paris",
        "Asia/Tokyo",
        "Australia/Sydney",
      ];
function PipedSetupDialog({ onClose }) {
  const [webhooks, setWebhooks] = useState([]);
  const [selectedWebhookUlid, setSelectedWebhookUlid] = useState("");
  const [pipedApiKey, setPipedApiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  useEffect(() => {
    fetch("/webhooks", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        const wh = (data.webhooks ?? [])
          .slice()
          .sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
          );
        setWebhooks(wh);
        if (wh.length > 0 && !selectedWebhookUlid) {
          setSelectedWebhookUlid(wh[0].ulid);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  const handleSetup = async () => {
    if (!selectedWebhookUlid || !pipedApiKey?.trim()) return;
    setMessage(null);
    setSaving(true);
    try {
      const webhook = webhooks.find((w) => w.ulid === selectedWebhookUlid);
      if (!webhook) {
        setMessage({ type: "error", text: "Webhook not found." });
        return;
      }
      const res = await fetch("/settings/piped-setup", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          webhook_url: webhook.url,
          piped_api_key: pipedApiKey,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMessage({
          type: "success",
          text: "Piped alias 'alert' configured successfully!",
        });
        setTimeout(() => onClose(), 2000);
      } else {
        setMessage({
          type: "error",
          text:
            data.message ||
            "Failed to configure alias. Please check your API key.",
        });
      }
    } catch (_err) {
      setMessage({
        type: "error",
        text: "Failed to connect to Piped. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  };
  if (loading) {
    return _jsx("div", {
      className: "webhook-config-overlay",
      onClick: onClose,
      children: _jsx("div", {
        className: "webhook-config-panel",
        onClick: (e) => e.stopPropagation(),
        children: _jsx("p", {
          style: { color: "var(--pues-text-secondary)" },
          children: "Loading\u2026",
        }),
      }),
    });
  }
  return _jsx("div", {
    className: "webhook-config-overlay",
    onClick: onClose,
    children: _jsxs("div", {
      className: "webhook-config-panel",
      onClick: (e) => e.stopPropagation(),
      children: [
        _jsxs("div", {
          style: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          },
          children: [
            _jsxs("div", {
              children: [
                _jsx("h3", {
                  style: { margin: 0, fontSize: 18 },
                  children: 'Make an "alert" alias in Piped',
                }),
                _jsxs("p", {
                  style: {
                    margin: "4px 0 0 0",
                    fontSize: 12,
                    color: "var(--pues-text-secondary)",
                  },
                  children: [
                    "Sign up at",
                    " ",
                    _jsx("a", {
                      href: "https://piped.sh/signup",
                      target: "_blank",
                      rel: "noopener noreferrer",
                      style: {
                        color: "var(--pues-accent-light)",
                        textDecoration: "none",
                      },
                      children: "piped.sh/signup",
                    }),
                  ],
                }),
              ],
            }),
            _jsx("button", {
              type: "button",
              className: "webhook-config-close",
              onClick: onClose,
              "aria-label": "Close",
              children: "\u00D7",
            }),
          ],
        }),
        _jsxs("div", {
          style: { marginBottom: 16 },
          children: [
            _jsx("label", {
              htmlFor: "webhook-select",
              style: {
                display: "block",
                fontSize: 12,
                color: "var(--pues-text-secondary)",
                marginBottom: 4,
              },
              children: "Webhook",
            }),
            _jsx("select", {
              id: "webhook-select",
              value: selectedWebhookUlid,
              onChange: (e) => setSelectedWebhookUlid(e.target.value),
              className: "input",
              style: { width: "100%", cursor: "pointer" },
              children: webhooks.map((w) =>
                _jsx("option", { value: w.ulid, children: w.name }, w.ulid),
              ),
            }),
          ],
        }),
        _jsxs("div", {
          style: { marginBottom: 16 },
          children: [
            _jsx("label", {
              htmlFor: "piped-api-key",
              style: {
                display: "block",
                fontSize: 12,
                color: "var(--pues-text-secondary)",
                marginBottom: 4,
              },
              children: "Piped API Key",
            }),
            _jsx("input", {
              id: "piped-api-key",
              type: "password",
              className: "input",
              placeholder: "pk_...",
              value: pipedApiKey,
              onChange: (e) => setPipedApiKey(e.target.value),
              style: { width: "100%" },
              autoComplete: "new-password",
            }),
          ],
        }),
        message &&
          _jsx("p", {
            style: {
              marginBottom: 16,
              fontSize: 13,
              color:
                message.type === "error"
                  ? "var(--pues-danger-text)"
                  : "var(--pues-success)",
            },
            children: message.text,
          }),
        _jsxs("div", {
          style: { display: "flex", gap: 8, justifyContent: "flex-end" },
          children: [
            _jsx("button", {
              type: "button",
              className: "btn btn-secondary",
              onClick: onClose,
              children: "Cancel",
            }),
            _jsx("button", {
              type: "button",
              className: "btn btn-primary",
              onClick: handleSetup,
              disabled: saving || !selectedWebhookUlid || !pipedApiKey.trim(),
              children: saving ? "Setting up…" : "Setup",
            }),
          ],
        }),
      ],
    }),
  });
}
export default function Settings({ onBack, email, timezone, onRefreshUser }) {
  const [loggingOut, setLoggingOut] = useState(false);
  const [savingTz, setSavingTz] = useState(false);
  const [showPipedDialog, setShowPipedDialog] = useState(false);
  // Display detected timezone when not set (actual save happens invisibly on login in App)
  const detectedTz =
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : "UTC";
  const currentTz = timezone && timezone.trim() !== "" ? timezone : detectedTz;
  const changeTimezone = async (value) => {
    const tz = value.trim();
    setSavingTz(true);
    try {
      const res = await fetch("/settings/me", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: tz || null }),
      });
      if (res.ok) onRefreshUser();
    } finally {
      setSavingTz(false);
    }
  };
  const logout = async () => {
    setLoggingOut(true);
    try {
      await fetch("/auth/logout", { method: "POST", credentials: "include" });
      window.location.reload();
    } finally {
      setLoggingOut(false);
    }
  };
  return _jsxs("div", {
    className: "screen",
    children: [
      _jsxs("div", {
        className: "screen-header",
        children: [
          _jsx("button", {
            type: "button",
            className: "back-btn",
            onClick: onBack,
            children: "\u25C0 Back",
          }),
          _jsx("h2", { className: "screen-title", children: "Settings" }),
        ],
      }),
      _jsxs("div", {
        className: "form",
        style: { padding: 16 },
        children: [
          _jsxs("div", {
            style: { marginBottom: 16 },
            children: [
              _jsx("div", {
                style: {
                  display: "block",
                  fontSize: 12,
                  color: "var(--pues-text-secondary)",
                  marginBottom: 4,
                },
                children: "Email",
              }),
              _jsx("p", {
                style: {
                  margin: 0,
                  fontSize: 14,
                  color: "var(--pues-text-primary)",
                },
                children: email,
              }),
              _jsx("p", {
                style: {
                  margin: "4px 0 0 0",
                  fontSize: 12,
                  color: "var(--pues-text-muted)",
                },
                children: "Managed by Legendum",
              }),
            ],
          }),
          _jsx("label", {
            htmlFor: "timezone-select",
            style: {
              display: "block",
              fontSize: 12,
              color: "var(--pues-text-secondary)",
              marginBottom: 4,
            },
            children: "Timezone",
          }),
          _jsx("select", {
            id: "timezone-select",
            className: "input",
            value: currentTz,
            onChange: (e) => changeTimezone(e.target.value),
            disabled: savingTz,
            style: { width: "100%", cursor: "pointer" },
            children: TIMEZONES.map((tz) =>
              _jsx("option", { value: tz, children: tz }, tz),
            ),
          }),
          savingTz &&
            _jsx("p", {
              style: {
                fontSize: 12,
                color: "var(--pues-text-secondary)",
                marginTop: 4,
              },
              children: "Updating\u2026",
            }),
          _jsx("div", {
            style: { marginTop: 24 },
            children: _jsx("button", {
              type: "button",
              className: "btn btn-secondary",
              onClick: () => setShowPipedDialog(true),
              style: { width: "100%" },
              children: 'Make an "alert" alias in Piped',
            }),
          }),
          _jsx("p", {
            style: { color: "var(--pues-text-secondary)", marginTop: 24 },
          }),
          _jsx("button", {
            type: "button",
            className: "btn btn-secondary",
            onClick: logout,
            disabled: loggingOut,
            children: loggingOut ? "Logging out…" : "Log out",
          }),
        ],
      }),
      showPipedDialog &&
        _jsx(PipedSetupDialog, { onClose: () => setShowPipedDialog(false) }),
    ],
  });
}
