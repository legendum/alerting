import { Dialog } from "pues/base/objects";
import { useEffect, useState } from "react";
import type { AlertingProfile } from "../App";

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

type SettingsDialogProps = {
  onClose: () => void;
  profile: AlertingProfile;
  onRefreshUser: () => void;
};

function formatQuotaReset(
  quotaReset: number | null | undefined,
): string | null {
  if (quotaReset == null) return null;
  const nextResetMs = (quotaReset + 7 * 24 * 3600) * 1000;
  return new Date(nextResetMs).toLocaleString();
}

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
    fetch("/api/webhooks", { credentials: "include" })
      .then((r) => r.json())
      .then((data: Webhook[]) => {
        const wh = (data ?? [])
          .slice()
          .sort((a, b) =>
            a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
          );
        setWebhooks(wh);
        if (wh.length > 0) setSelectedWebhookId(wh[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSetup = async () => {
    if (!selectedWebhookId || !pipedApiKey.trim()) return;
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
    } catch {
      setMessage({
        type: "error",
        text: "Failed to connect to Piped. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog title='Make an "alert" alias in Piped' onClose={onClose}>
      {loading ? (
        <p style={{ color: "var(--pues-text-secondary)" }}>Loading…</p>
      ) : (
        <>
          <p className="dialog-lede">
            Sign up at{" "}
            <a
              href="https://piped.sh/signup"
              target="_blank"
              rel="noopener noreferrer"
            >
              piped.sh/signup
            </a>
          </p>
          <section className="pues-dialog-section">
            <h3>Webhook</h3>
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
          </section>
          <section className="pues-dialog-section">
            <h3>Piped API key</h3>
            <input
              id="piped-api-key"
              type="password"
              className="pues-dialog-input"
              placeholder="pk_…"
              value={pipedApiKey}
              onChange={(e) => setPipedApiKey(e.target.value)}
              autoComplete="new-password"
            />
          </section>
          {message ? (
            <p
              style={{
                fontSize: 13,
                color:
                  message.type === "error"
                    ? "var(--pues-danger-text)"
                    : "var(--pues-success)",
              }}
            >
              {message.text}
            </p>
          ) : null}
          <div className="form-button-row form-button-row--end">
            <button
              type="button"
              className="pues-btn pues-btn-secondary"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="pues-btn"
              onClick={handleSetup}
              disabled={saving || !selectedWebhookId || !pipedApiKey.trim()}
            >
              {saving ? "Setting up…" : "Setup"}
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}

export default function SettingsDialog({
  onClose,
  profile,
  onRefreshUser,
}: SettingsDialogProps) {
  const [loggingOut, setLoggingOut] = useState(false);
  const [savingTz, setSavingTz] = useState(false);
  const [showPipedDialog, setShowPipedDialog] = useState(false);

  const detectedTz =
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : "UTC";
  const currentTz =
    profile.timezone && profile.timezone.trim() !== ""
      ? profile.timezone
      : detectedTz;
  const quotaTotal = profile.quota_basic + profile.quota_extra;
  const nextReset = formatQuotaReset(profile.quota_reset);

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
      await fetch("/pues/auth/logout", {
        method: "POST",
        credentials: "include",
      });
      window.location.reload();
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <>
      <Dialog title="Settings" onClose={onClose}>
        <section className="pues-dialog-section">
          <h3>Timezone</h3>
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
          {savingTz ? (
            <p
              style={{
                fontSize: 12,
                color: "var(--pues-text-secondary)",
                marginTop: 4,
              }}
            >
              Updating…
            </p>
          ) : null}
        </section>

        <section className="pues-dialog-section">
          <h3>Quota</h3>
          <p
            className={`quota-badge${quotaTotal < 20 ? " quota-badge--low" : ""}`}
            style={{ display: "inline-block", margin: 0 }}
          >
            {quotaTotal} alerts remaining
          </p>
          <p
            style={{
              margin: "8px 0 0",
              fontSize: 13,
              color: "var(--pues-text-secondary)",
            }}
          >
            {nextReset
              ? `100 free alerts per week, refreshing on ${nextReset} (approx).`
              : "100 free alerts per week."}
          </p>
        </section>

        <section className="pues-dialog-section">
          <h3>Email</h3>
          <p style={{ margin: 0, fontSize: 14 }}>{profile.email}</p>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 12,
              color: "var(--pues-text-muted)",
            }}
          >
            <a
              href="https://legendum.co.uk/account"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "var(--pues-accent-light)",
                textDecoration: "none",
              }}
            >
              Managed by Legendum
            </a>
          </p>
        </section>

        {/* <section className="pues-dialog-section">
          <button
            type="button"
            className="pues-btn pues-btn-secondary"
            onClick={() => setShowPipedDialog(true)}
            style={{ width: "100%" }}
          >
            Make an &quot;alert&quot; alias in Piped
          </button>
        </section> */}

        <div className="form-button-row form-button-row--end">
          <button
            type="button"
            className="pues-btn pues-btn-secondary"
            onClick={logout}
            disabled={loggingOut}
          >
            {loggingOut ? "Logging out…" : "Log out"}
          </button>
        </div>
      </Dialog>
      {showPipedDialog ? (
        <PipedSetupDialog onClose={() => setShowPipedDialog(false)} />
      ) : null}
    </>
  );
}
