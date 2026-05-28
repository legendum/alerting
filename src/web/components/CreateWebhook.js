import { useRef, useState } from "react";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export default function CreateWebhook({ onDone, onBack }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const copiedTimeoutRef = useRef(null);
  const submit = async (e) => {
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
        setError(data.message ?? "Failed to create");
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
    return _jsxs("div", {
      className: "screen",
      children: [
        _jsxs("div", {
          className: "screen-header",
          children: [
            _jsx("button", {
              type: "button",
              className: "back-btn",
              onClick: onDone,
              children: "\u25C0 Back",
            }),
            _jsx("h2", {
              className: "screen-title",
              children: "Webhook created",
            }),
          ],
        }),
        _jsxs("div", {
          className: "form",
          style: { padding: 16 },
          children: [
            _jsx("p", {
              style: { color: "var(--pues-text-secondary)" },
              children: "Use this URL to trigger alerts:",
            }),
            _jsx("input", {
              className: "input",
              readOnly: true,
              value: created.url,
              style: { fontFamily: "monospace", fontSize: 13 },
            }),
            _jsx("button", {
              type: "button",
              className: "btn",
              onClick: copyUrl,
              style: copied
                ? {
                    background: "var(--pues-success)",
                    color: "var(--pues-on-accent)",
                  }
                : undefined,
              children: copied ? "Copied" : "Copy URL",
            }),
            _jsx("button", {
              type: "button",
              className: "btn btn-secondary",
              onClick: onDone,
              children: "Done",
            }),
          ],
        }),
      ],
    });
  }
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
          _jsx("h2", { className: "screen-title", children: "New webhook" }),
        ],
      }),
      _jsxs("form", {
        className: "form",
        onSubmit: submit,
        children: [
          _jsx("input", {
            className: "input",
            placeholder: "Name (required)",
            value: name,
            onChange: (e) => setName(e.target.value),
          }),
          _jsx("input", {
            className: "input",
            placeholder: "Description (optional)",
            value: description,
            onChange: (e) => setDescription(e.target.value),
          }),
          error &&
            _jsx("p", {
              style: { color: "var(--pues-danger-text)" },
              children: error,
            }),
          _jsx("button", {
            type: "submit",
            className: "btn",
            disabled: loading,
            children: loading ? "Creating…" : "Create",
          }),
        ],
      }),
    ],
  });
}
