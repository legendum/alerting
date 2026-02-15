import React, { useState } from "react";
import { getAppName } from "../appName";

type Props = { onLogin: () => void; initialMode?: "login" | "signup" };

export default function Login({ onLogin, initialMode = "login" }: Props) {
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [step, setStep] = useState<"email" | "verify">("email");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [devLoginLink, setDevLoginLink] = useState<string | null>(null);
  const [devToken, setDevToken] = useState<string | null>(null);

  const isSignup = mode === "signup";

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setMessage("");
    setDevLoginLink(null);
    setDevToken(null);
    try {
      const res = await fetch("/auth/request-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { login_link?: string; token?: string; message?: string };
      if (res.ok) {
        setStep("verify");
        if (data.login_link) setDevLoginLink(data.login_link);
        if (data.token) {
          setDevToken(data.token);
          setToken(data.token);
        }
        setMessage(
          data.token
            ? "Dev mode: use the link or token below to log in."
            : isSignup
              ? "Check your email for the sign-up link."
              : "Check your email for the login link."
        );
      } else {
        setMessage(data.message ?? "Something went wrong.");
      }
    } catch {
      setMessage("Network error.");
    } finally {
      setLoading(false);
    }
  };

  const submitToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;
    setLoading(true);
    setMessage("");
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
        setMessage((data as { message?: string }).message ?? "Invalid or expired link.");
      }
    } catch {
      setMessage("Network error.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <h1>{getAppName()}</h1>
      <p>{isSignup ? "Create an account to get push notifications from your webhooks." : "Get push notifications from your webhooks."}</p>

      {step === "email" ? (
        <form className="form" onSubmit={submitEmail}>
          <input
            className="input"
            type="email"
            placeholder="Your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          <button type="submit" className="btn" disabled={loading}>
            {loading ? "Sending…" : isSignup ? "Send sign-up link" : "Send login link"}
          </button>
          <p style={{ marginTop: 16, fontSize: 14, color: "#94a3b8" }}>
            {isSignup ? (
              <>Already have an account?{" "}
                <button type="button" className="link" onClick={() => setMode("login")}>Log in</button>
              </>
            ) : (
              <>Don&apos;t have an account?{" "}
                <button type="button" className="link" onClick={() => setMode("signup")}>Sign up</button>
              </>
            )}
          </p>
        </form>
      ) : (
        <form className="form" onSubmit={submitToken}>
          <p style={{ color: "#94a3b8", marginBottom: 12 }}>{message}</p>
          {devLoginLink && (
            <div style={{ marginBottom: 12 }}>
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
            <p style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>
              Token is pre-filled below — click Log in, or copy the link above.
            </p>
          )}
          <input
            className="input"
            type="text"
            placeholder="Paste the token from your email"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <button type="submit" className="btn" disabled={loading}>
            {loading ? "Logging in…" : "Log in"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setStep("email")}
          >
            Use a different email
          </button>
        </form>
      )}

      {message && step === "email" && <p style={{ color: "#f87171", marginTop: 12 }}>{message}</p>}
      {message && step === "verify" && (
        <p style={{ color: "#f87171", marginTop: 12 }}>{message}</p>
      )}
    </div>
  );
}
