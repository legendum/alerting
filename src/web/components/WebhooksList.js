import { ThemeChooser } from "pues/base/theme";
import { useCallback, useEffect, useRef, useState } from "react";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { formatMailHour } from "../formatMailHour";
import { onEventsUpdate } from "../messages";

const CONFIG_WIDTH = 72;
const DELETE_WIDTH = 72;
const REVEAL_WIDTH = CONFIG_WIDTH + DELETE_WIDTH; /* Config + Delete */
const SNAP_THRESHOLD = REVEAL_WIDTH / 2;
function WebhookRow({ webhook, unreadCount, onSelect, onConfig, onDelete }) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef(null);
  const movedEnough = useRef(false);
  const onPointerDown = (e) => {
    movedEnough.current = false;
    const target = e.target;
    if (
      target.closest?.("button.webhook-row-config") ||
      target.closest?.("button.webhook-row-delete")
    ) {
      return;
    }
    if (e.pointerType === "mouse") e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = { x: e.clientX, offset };
    setDragging(true);
  };
  const onPointerMove = (e) => {
    if (dragStart.current == null) return;
    if (e.pointerType === "mouse" && e.buttons !== 1) {
      onPointerUp();
      return;
    }
    const dx = e.clientX - dragStart.current.x;
    if (Math.abs(dx) > 5) movedEnough.current = true;
    const next = Math.max(
      -REVEAL_WIDTH,
      Math.min(0, dragStart.current.offset + dx),
    );
    setOffset(next);
  };
  const onPointerUp = () => {
    if (dragStart.current == null) return;
    const wasRevealed = dragStart.current.offset <= -SNAP_THRESHOLD;
    const snapOpen = offset < -SNAP_THRESHOLD;
    if (!movedEnough.current) {
      if (wasRevealed) setOffset(0);
      else onSelect();
    } else {
      setOffset(snapOpen ? -REVEAL_WIDTH : 0);
    }
    dragStart.current = null;
    setDragging(false);
  };
  const onConfigClick = (e) => {
    e.stopPropagation();
    onConfig();
  };
  const onDeleteClick = (e) => {
    e.stopPropagation();
    onDelete();
  };
  const sliderStyle = {
    transform: `translateX(${offset}px)`,
    transition: dragging ? "none" : "transform 0.15s ease-out",
  };
  return _jsx("li", {
    className: "webhook-row-wrap",
    children: _jsxs("div", {
      className: "webhook-row-slider",
      style: sliderStyle,
      onPointerDown: onPointerDown,
      onPointerMove: onPointerMove,
      onPointerUp: onPointerUp,
      onPointerCancel: onPointerUp,
      children: [
        _jsxs("div", {
          className: "list-item webhook-row-main",
          children: [
            _jsxs("div", {
              className: "list-item-content",
              children: [
                _jsx("div", {
                  className: "list-item-title",
                  children: webhook.label,
                }),
                webhook.description &&
                  _jsx("div", {
                    className: "list-item-meta",
                    children: webhook.description,
                  }),
              ],
            }),
            unreadCount > 0 &&
              _jsx("span", { className: "badge", children: unreadCount }),
          ],
        }),
        _jsx("button", {
          type: "button",
          className: "webhook-row-config",
          onClick: onConfigClick,
          "aria-label": "Configure webhook",
          children: "Config",
        }),
        _jsx("button", {
          type: "button",
          className: "webhook-row-delete",
          onClick: onDeleteClick,
          "aria-label": "Delete webhook",
          children: "Delete",
        }),
      ],
    }),
  });
}
const RETENTION_OPTIONS = [
  { days: 1, label: "1 day" },
  { days: 2, label: "2 days" },
  { days: 7, label: "1 week" },
  { days: 14, label: "2 weeks" },
  { days: 30, label: "1 month" },
  { days: 60, label: "2 months" },
  { days: 90, label: "3 months" },
];
const RETENTION_DAYS_SET = new Set(RETENTION_OPTIONS.map((o) => o.days));
function isRetentionDays(value) {
  return RETENTION_DAYS_SET.has(value);
}
function WebhookConfigPanel({ webhookId, onClose, onSaved, mailHour = 8 }) {
  const mailHourText = formatMailHour(mailHour);
  const [name, setName] = useState("");
  const [emailFrequency, setEmailFrequency] = useState("never");
  const [retentionDays, setRetentionDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  useEffect(() => {
    fetch(`/api/webhooks/${webhookId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        let p;
        if (typeof data.policy === "string") {
          try {
            p = JSON.parse(data.policy) ?? {};
          } catch {
            p = {};
          }
        } else {
          p = data.policy ?? {};
        }
        setName(data.label ?? "");
        const e = p.email_schedule ?? "never";
        setEmailFrequency(e === "each" || e === "daily" ? e : "never");
        const r = p.retention_days;
        setRetentionDays(typeof r === "number" && isRetentionDays(r) ? r : 7);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [webhookId]);
  const handleSave = () => {
    setSaving(true);
    fetch(`/api/webhooks/${webhookId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        policy: {
          email_schedule: emailFrequency,
          retention_days: retentionDays,
        },
      }),
    })
      .then((r) => (r.ok ? onSaved() : undefined))
      .finally(() => setSaving(false));
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
            _jsxs("h3", {
              style: { margin: 0, fontSize: 18 },
              children: ["Config: ", name || webhookId],
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
              htmlFor: "email-frequency",
              style: {
                display: "block",
                fontSize: 12,
                color: "var(--pues-text-secondary)",
                marginBottom: 4,
              },
              children: "Email frequency",
            }),
            _jsxs("select", {
              id: "email-frequency",
              value: emailFrequency,
              onChange: (e) => setEmailFrequency(e.target.value),
              className: "input",
              style: { width: "100%", cursor: "pointer" },
              children: [
                _jsx("option", { value: "never", children: "Never" }),
                _jsx("option", { value: "each", children: "Each alert" }),
                _jsxs("option", {
                  value: "daily",
                  children: ["Daily alerts (", mailHourText, ")"],
                }),
              ],
            }),
          ],
        }),
        _jsxs("div", {
          style: { marginBottom: 16 },
          children: [
            _jsx("label", {
              htmlFor: "retention-days",
              style: {
                display: "block",
                fontSize: 12,
                color: "var(--pues-text-secondary)",
                marginBottom: 4,
              },
              children: "Keep events",
            }),
            _jsx("select", {
              id: "retention-days",
              value: retentionDays,
              onChange: (e) => {
                const next = Number(e.target.value);
                if (isRetentionDays(next)) setRetentionDays(next);
              },
              className: "input",
              style: { width: "100%", cursor: "pointer" },
              children: RETENTION_OPTIONS.map((o) =>
                _jsx("option", { value: o.days, children: o.label }, o.days),
              ),
            }),
          ],
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
              onClick: handleSave,
              disabled: saving,
              children: saving ? "Saving…" : "Save",
            }),
          ],
        }),
      ],
    }),
  });
}
let cachedWebhooks = null;
export default function WebhooksList({
  onSelectWebhook,
  onAddWebhook,
  mailHour = 8,
}) {
  const [webhooks, setWebhooks] = useState(cachedWebhooks ?? []);
  const [unreadByWebhook, setUnreadByWebhook] = useState({});
  const [loading, setLoading] = useState(cachedWebhooks === null);
  const [configWebhookId, setConfigWebhookId] = useState(null);
  const setWebhooksAndCache = useCallback((wh) => {
    cachedWebhooks = wh;
    setWebhooks(wh);
  }, []);
  const fetchWebhooks = useCallback(() => {
    return fetch("/api/webhooks", { credentials: "include" })
      .then((r) => r.json())
      .then((wh) => {
        setWebhooksAndCache(wh ?? []);
      })
      .catch(() => {});
  }, [setWebhooksAndCache]);
  const fetchData = useCallback(() => {
    return Promise.all([
      fetchWebhooks(),
      fetch("/alerts", { credentials: "include" }).then((r) => r.json()),
    ])
      .then(([, ev]) => {
        setUnreadByWebhook(ev.unread_by_webhook ?? {});
      })
      .catch(() => {});
  }, [fetchWebhooks]);
  useEffect(() => {
    if (cachedWebhooks !== null) {
      fetchData();
    } else {
      fetchData().finally(() => setLoading(false));
    }
  }, [fetchData]);
  // Listen for events updates from service worker
  useEffect(() => {
    const unsubscribe = onEventsUpdate((data) => {
      if (data.unread_by_webhook) {
        setUnreadByWebhook(data.unread_by_webhook);
      }
    });
    return unsubscribe;
  }, []);
  // Still poll webhooks separately (they change less frequently)
  useEffect(() => {
    const interval = setInterval(fetchWebhooks, 5 * 60 * 1000); // Poll webhooks every 5 minutes
    return () => clearInterval(interval);
  }, [fetchWebhooks]);
  const getOrderedWebhooks = () =>
    [...webhooks].sort((a, b) => Number(a.position) - Number(b.position));
  const handleDelete = useCallback(
    (id) => {
      setConfigWebhookId(null);
      setWebhooksAndCache(webhooks.filter((w) => w.id !== id));
      fetch(`/api/webhooks/${id}`, {
        method: "DELETE",
        credentials: "include",
      }).then(() => {
        fetchData();
      });
    },
    [webhooks, setWebhooksAndCache, fetchData],
  );
  const handleConfig = useCallback((id) => {
    setConfigWebhookId(id);
  }, []);
  if (loading) {
    return _jsx("div", {
      style: { padding: 24, color: "var(--pues-text-secondary)" },
      children: "Loading webhooks\u2026",
    });
  }
  const ordered = getOrderedWebhooks();
  return _jsxs("div", {
    className: "screen",
    children: [
      _jsx("ul", {
        className: "list",
        children: ordered.map((w) =>
          _jsx(
            WebhookRow,
            {
              webhook: w,
              unreadCount: unreadByWebhook[w.id] ?? 0,
              onSelect: () => onSelectWebhook(w.id),
              onConfig: () => handleConfig(w.id),
              onDelete: () => handleDelete(w.id),
            },
            w.id,
          ),
        ),
      }),
      configWebhookId &&
        _jsx(WebhookConfigPanel, {
          webhookId: configWebhookId,
          onClose: () => setConfigWebhookId(null),
          onSaved: () => {
            setConfigWebhookId(null);
            fetchData();
          },
          mailHour: mailHour,
        }),
      _jsxs("div", {
        className: "webhooks-list-theme",
        children: [
          _jsx("p", {
            className: "webhooks-list-theme-label",
            children: "Theme",
          }),
          _jsx(ThemeChooser, { endpoint: "/settings/me" }),
        ],
      }),
      _jsx("button", {
        type: "button",
        className: "fab",
        onClick: onAddWebhook,
        title: "Create webhook",
        children: "+",
      }),
    ],
  });
}
