import { useEffect, useState } from "react";

const TIMEZONES: string[] =
  typeof Intl !== "undefined" &&
  typeof (Intl as { supportedValuesOf?: (key: string) => string[] })
    .supportedValuesOf === "function"
    ? (Intl as { supportedValuesOf(key: "timeZone"): string[] })
        .supportedValuesOf("timeZone")
        .sort()
    : [
        "UTC",
        "America/New_York",
        "America/Los_Angeles",
        "Europe/London",
        "Europe/Paris",
        "Asia/Tokyo",
        "Australia/Sydney",
      ];

type Webhook = {
  id: string;
  label: string;
  position: number;
};

type Props = {
  onBack: () => void;
  email: string;
  timezone: string | null;
  onRefreshUser: () => void;
};

function PipedSetupDialog({ onClose }: { onClose: () => void }) {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [selectedWebhookId, setSelectedWebhookId] = useState<string>("");
  const [pipedApiKey, setPipedApiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    fetch("/api/webhooks", { credentials: "include" })
      .then((r) => r.json())
      .then((data: Webhook[]) => {
        const wh = (data ?? [])
          .slice()
          .sort((a, b) =>
            a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
          );
        setWebhooks(wh);
        if (wh.length > 0 && !selectedWebhookId) {
          setSelectedWebhookId(wh[0].id);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSetup = async () => {
    if (!selectedWebhookId || !pipedApiKey?.trim()) return;
    setMessage(null);
    setSaving(true);
    try {
      const webhook = webhooks.find((w) => w.id === selectedWebhookId);
      if (!webhook) {
        setMessage({ type: "error", text: "Webhook not found." });
        return;
      }
      const origin =
        typeof window !== "undefined"
          ? window.location.origin
          : "http://localhost:3000";
      const res = await fetch("/settings/piped-setup", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          webhook_url: `${origin}/w/${webhook.id}`,
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
            (data as { message?: string }).message ||
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
    return (
      <div className="webhook-config-overlay" onClick={onClose}>
        <div
          className="webhook-config-panel"
          onClick={(e) => e.stopPropagation()}
        >
          <p style={{ color: "var(--pues-text-secondary)" }}>Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="webhook-config-overlay" onClick={onClose}>
      <div
        className="webhook-config-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: 18 }}>
              Make an "alert" alias in Piped
            </h3>
            <p
              style={{
                margin: "4px 0 0 0",
                fontSize: 12,
                color: "var(--pues-text-secondary)",
              }}
            >
              Sign up at{" "}
              <a
                href="https://piped.sh/signup"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: "var(--pues-accent-light)",
                  textDecoration: "none",
                }}
              >
                piped.sh/signup
              </a>
            </p>
          </div>
          <button
            type="button"
            className="webhook-config-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label
            htmlFor="webhook-select"
            style={{
              display: "block",
              fontSize: 12,
              color: "var(--pues-text-secondary)",
              marginBottom: 4,
            }}
          >
            Webhook
          </label>
          <select
            id="webhook-select"
            className="pues-dialog-select"
            value={selectedWebhookId}
            onChange={(e) => setSelectedWebhookId(e.target.value)}
          >
            {webhooks.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
              </option>
            ))}
          </select>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label
            htmlFor="piped-api-key"
            style={{
              display: "block",
              fontSize: 12,
              color: "var(--pues-text-secondary)",
              marginBottom: 4,
            }}
          >
            Piped API Key
          </label>
          <input
            id="piped-api-key"
            type="password"
            className="input"
            placeholder="pk_..."
            value={pipedApiKey}
            onChange={(e) => setPipedApiKey(e.target.value)}
            style={{ width: "100%" }}
            autoComplete="new-password"
          />
        </div>
        {message && (
          <p
            style={{
              marginBottom: 16,
              fontSize: 13,
              color:
                message.type === "error"
                  ? "var(--pues-danger-text)"
                  : "var(--pues-success)",
            }}
          >
            {message.text}
          </p>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSetup}
            disabled={saving || !selectedWebhookId || !pipedApiKey.trim()}
          >
            {saving ? "Setting up…" : "Setup"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Settings({
  onBack,
  email,
  timezone,
  onRefreshUser,
}: Props) {
  const [loggingOut, setLoggingOut] = useState(false);
  const [savingTz, setSavingTz] = useState(false);
  const [showPipedDialog, setShowPipedDialog] = useState(false);
  // Display detected timezone when not set (actual save happens invisibly on login in App)
  const detectedTz =
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : "UTC";
  const currentTz = timezone && timezone.trim() !== "" ? timezone : detectedTz;

  const changeTimezone = async (value: string) => {
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

  return (
    <div className="screen">
      <div className="screen-header">
        <button type="button" className="back-btn" onClick={onBack}>
          ◀ Back
        </button>
        <h2 className="screen-title">Settings</h2>
      </div>
      <div className="form" style={{ padding: 16 }}>
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              display: "block",
              fontSize: 12,
              color: "var(--pues-text-secondary)",
              marginBottom: 4,
            }}
          >
            Email
          </div>
          <p
            style={{
              margin: 0,
              fontSize: 14,
              color: "var(--pues-text-primary)",
            }}
          >
            {email}
          </p>
          <p
            style={{
              margin: "4px 0 0 0",
              fontSize: 12,
              color: "var(--pues-text-muted)",
            }}
          >
            Managed by Legendum
          </p>
        </div>

        <label
          htmlFor="timezone-select"
          style={{
            display: "block",
            fontSize: 12,
            color: "var(--pues-text-secondary)",
            marginBottom: 4,
          }}
        >
          Timezone
        </label>
        <select
          id="timezone-select"
          className="pues-dialog-select"
          value={currentTz}
          onChange={(e) => changeTimezone(e.target.value)}
          disabled={savingTz}
        >
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
        {savingTz && (
          <p
            style={{
              fontSize: 12,
              color: "var(--pues-text-secondary)",
              marginTop: 4,
            }}
          >
            Updating…
          </p>
        )}

        <div style={{ marginTop: 24 }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowPipedDialog(true)}
            style={{ width: "100%" }}
          >
            Make an "alert" alias in Piped
          </button>
        </div>

        <p style={{ color: "var(--pues-text-secondary)", marginTop: 24 }} />
        <button
          type="button"
          className="btn btn-secondary"
          onClick={logout}
          disabled={loggingOut}
        >
          {loggingOut ? "Logging out…" : "Log out"}
        </button>
      </div>
      {showPipedDialog && (
        <PipedSetupDialog onClose={() => setShowPipedDialog(false)} />
      )}
    </div>
  );
}
