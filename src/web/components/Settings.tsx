import React, { useState } from "react";

const TIMEZONES: string[] =
  typeof Intl !== "undefined" && typeof (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf === "function"
    ? (Intl as { supportedValuesOf(key: "timeZone"): string[] }).supportedValuesOf("timeZone").sort()
    : ["UTC", "America/New_York", "America/Los_Angeles", "Europe/London", "Europe/Paris", "Asia/Tokyo", "Australia/Sydney"];

type Props = { onBack: () => void; email: string; email_new?: string; timezone: string | null; onRefreshUser: () => void };

export default function Settings({ onBack, email, email_new, timezone, onRefreshUser }: Props) {
  const [loggingOut, setLoggingOut] = useState(false);
  const [savingTz, setSavingTz] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [changeEmailSending, setChangeEmailSending] = useState(false);
  const [changeEmailMessage, setChangeEmailMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  // Display detected timezone when not set (actual save happens invisibly on login in App)
  const detectedTz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";
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

  const sendChangeEmail = async () => {
    const value = newEmail.trim();
    if (!value) return;
    setChangeEmailMessage(null);
    setChangeEmailSending(true);
    try {
      const res = await fetch("/settings/change-email", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_new: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setChangeEmailMessage({ type: "success", text: `Confirmation sent to ${(data as { email_new?: string }).email_new ?? value}. Check that inbox and click the link.` });
        setNewEmail("");
        onRefreshUser();
      } else {
        setChangeEmailMessage({ type: "error", text: (data as { message?: string }).message ?? "Something went wrong." });
      }
    } finally {
      setChangeEmailSending(false);
    }
  };

  return (
    <div className="screen">
      <div className="screen-header">
        <button type="button" className="back-btn" onClick={onBack}>
          ← Back
        </button>
        <h2 className="screen-title">Settings</h2>
      </div>
      <div className="form" style={{ padding: 16 }}>
        <label style={{ display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>Timezone</label>
        <select
          className="input"
          value={currentTz}
          onChange={(e) => changeTimezone(e.target.value)}
          disabled={savingTz}
          style={{ width: "100%", cursor: "pointer" }}
        >
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
        {savingTz && <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>Updating…</p>}

        <div style={{ marginTop: 24 }}>
          <label style={{ display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>Current email</label>
          <p style={{ margin: 0, fontSize: 14, color: "#e2e8f0" }}>{email}</p>
          {email_new && (
            <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>
              Pending: <strong>{email_new}</strong> — check that inbox and click the confirmation link.
            </p>
          )}
          <label style={{ display: "block", fontSize: 12, color: "#94a3b8", marginTop: 12, marginBottom: 4 }}>New email</label>
          <input
            type="email"
            className="input"
            placeholder="new@example.com"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            disabled={changeEmailSending}
            style={{ width: "100%", marginBottom: 8 }}
          />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={sendChangeEmail}
            disabled={changeEmailSending || !newEmail.trim()}
          >
            {changeEmailSending ? "Sending…" : "Send confirmation link"}
          </button>
          {changeEmailMessage && (
            <p style={{ marginTop: 8, fontSize: 13, color: changeEmailMessage.type === "error" ? "#f87171" : "#86efac" }}>
              {changeEmailMessage.text}
            </p>
          )}
        </div>

        <p style={{ color: "#94a3b8", marginTop: 24 }} />
        <button
          type="button"
          className="btn btn-secondary"
          onClick={logout}
          disabled={loggingOut}
        >
          {loggingOut ? "Logging out…" : "Log out"}
        </button>
      </div>
    </div>
  );
}
