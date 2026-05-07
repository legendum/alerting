import type React from "react";
import { useRef, useState } from "react";

type Props = { onDone: () => void; onBack: () => void };

export default function CreateWebhook({ onDone, onBack }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<{ url: string; ulid: string } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/webhooks", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setCreated({ url: data.url, ulid: data.ulid });
      } else {
        setError((data as { message?: string }).message ?? "Failed to create");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  const copyUrl = () => {
    if (created?.url) {
      navigator.clipboard.writeText(created.url);
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
      setCopied(true);
      copiedTimeoutRef.current = setTimeout(() => {
        setCopied(false);
        copiedTimeoutRef.current = null;
      }, 1500);
    }
  };

  if (created) {
    return (
      <div className="screen">
        <div className="screen-header">
          <button type="button" className="back-btn" onClick={onDone}>
            ◀ Back
          </button>
          <h2 className="screen-title">Webhook created</h2>
        </div>
        <div className="form" style={{ padding: 16 }}>
          <p style={{ color: "#94a3b8" }}>Use this URL to trigger alerts:</p>
          <input
            className="input"
            readOnly
            value={created.url}
            style={{ fontFamily: "monospace", fontSize: 13 }}
          />
          <button
            type="button"
            className="btn"
            onClick={copyUrl}
            style={
              copied ? { background: "#16a34a", color: "#fff" } : undefined
            }
          >
            {copied ? "Copied" : "Copy URL"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onDone}>
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="screen-header">
        <button type="button" className="back-btn" onClick={onBack}>
          ◀ Back
        </button>
        <h2 className="screen-title">New webhook</h2>
      </div>
      <form className="form" onSubmit={submit}>
        <input
          className="input"
          placeholder="Name (required)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="input"
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        {error && <p style={{ color: "#f87171" }}>{error}</p>}
        <button type="submit" className="btn" disabled={loading}>
          {loading ? "Creating…" : "Create"}
        </button>
      </form>
    </div>
  );
}
