import React, { useState } from "react";

const TIMEZONES: string[] =
  typeof Intl !== "undefined" && typeof (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf === "function"
    ? (Intl as { supportedValuesOf(key: "timeZone"): string[] }).supportedValuesOf("timeZone").sort()
    : ["UTC", "America/New_York", "America/Los_Angeles", "Europe/London", "Europe/Paris", "Asia/Tokyo", "Australia/Sydney"];

type Props = { onBack: () => void; timezone: string | null; onRefreshUser: () => void };

export default function Settings({ onBack, timezone, onRefreshUser }: Props) {
  const [loggingOut, setLoggingOut] = useState(false);
  const [savingTz, setSavingTz] = useState(false);
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
        <p style={{ color: "#94a3b8", marginTop: 24 }}>
          Change email and more coming soon. For now you can log out.
        </p>
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
