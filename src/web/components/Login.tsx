import React, { useState } from "react";
import { getAppName } from "../appName";

type Props = { onLogin: () => void };

export default function Login({ onLogin }: Props) {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [loadingToken, setLoadingToken] = useState(false);
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [tokenMessage, setTokenMessage] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [devLoginLink, setDevLoginLink] = useState<string | null>(null);
  const [devToken, setDevToken] = useState<string | null>(null);

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoadingEmail(true);
    setEmailMessage("");
    setDevLoginLink(null);
    setDevToken(null);
    try {
      const res = await fetch("/auth/request-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { login_link?: string; token?: string; message?: string; error?: string };

      // Handle dev mode tokens/links (shown even on errors in dev mode)
      if (data.login_link) setDevLoginLink(data.login_link);
      if (data.token) {
        setDevToken(data.token);
        setToken(data.token);
      }

      if (res.ok) {
        setEmailMessage(
          data.token
            ? "Dev mode: check the token below, or check your email for the login link and token."
            : "Check your email for the login link and token."
        );
        setEmail(""); // Clear email field after successful request
      } else {
        setEmailMessage(data.message ?? "Something went wrong.");
      }
    } catch {
      setEmailMessage("Network error.");
    } finally {
      setLoadingEmail(false);
    }
  };

  const submitToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;
    setLoadingToken(true);
    setTokenMessage("");
    try {
      const res = await fetch("/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
        credentials: "include",
      });
      if (res.ok) {
        onLogin();
      } else {
        const data = await res.json().catch(() => ({}));
        setTokenMessage((data as { message?: string }).message ?? "Invalid or expired token.");
      }
    } catch {
      setTokenMessage("Network error.");
    } finally {
      setLoadingToken(false);
    }
  };

  return (
    <div className="login-screen">
      <h1>{getAppName()}</h1>
      <p>Get push notifications from your webhooks.</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
        {/* Section 1: Enter your login token */}
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Enter your login token</h2>
          <form className="form" onSubmit={submitToken}>
            <input
              className="input"
              type="text"
              placeholder="Paste the token from your email"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <button type="submit" className="btn" disabled={loadingToken}>
              {loadingToken ? "Logging in…" : "Log in"}
            </button>
            {tokenMessage && (
              <p style={{ color: tokenMessage.toLowerCase().includes("error") || tokenMessage.toLowerCase().includes("invalid") ? "#f87171" : "#94a3b8", marginTop: 12, fontSize: 14 }}>
                {tokenMessage}
              </p>
            )}
          </form>
        </div>

        {/* Section 2: Send me a new login token */}
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>…or send me a new login token</h2>
          <form className="form" onSubmit={submitEmail}>
            <input
              className="input"
              type="email"
              placeholder="Your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
            <button type="submit" className="btn" disabled={loadingEmail}>
              {loadingEmail ? "Sending…" : "Send login link"}
            </button>
            <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 8, marginBottom: 0 }}>
              I understand this logs me out of all devices
            </p>
            {emailMessage && (
              <p style={{ color: emailMessage.toLowerCase().includes("error") || emailMessage.toLowerCase().includes("wrong") ? "#f87171" : "#94a3b8", marginTop: 12, fontSize: 14 }}>
                {emailMessage}
              </p>
            )}
            {devLoginLink && (
              <div style={{ marginTop: 12 }}>
                <label style={{ fontSize: 12, color: "#94a3b8", display: "block", marginBottom: 4 }}>Login link (dev)</label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    className="input"
                    readOnly
                    value={devLoginLink}
                    style={{ flex: 1, fontFamily: "monospace", fontSize: 12 }}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => navigator.clipboard.writeText(devLoginLink)}
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}
            {devToken && (
              <div style={{ marginTop: 12 }}>
                <label style={{ fontSize: 12, color: "#94a3b8", display: "block", marginBottom: 4 }}>Token (dev)</label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    className="input"
                    readOnly
                    value={devToken}
                    style={{ flex: 1, fontFamily: "monospace", fontSize: 12 }}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      navigator.clipboard.writeText(devToken);
                      setToken(devToken);
                    }}
                  >
                    Copy & Use
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
