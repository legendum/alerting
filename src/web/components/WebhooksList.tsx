import { ThemeChooser } from "pues/base/theme";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatMailHour } from "../formatMailHour";
import { onEventsUpdate } from "../messages";

type Webhook = {
  ulid: string;
  name: string;
  description: string | null;
  url: string;
  policy?: { email_schedule?: string; retention_days?: number };
};
type EventItem = {
  id: number;
  webhook_ulid: string;
  read_at: number | null;
  created_at: number;
};

const CONFIG_WIDTH = 72;
const DELETE_WIDTH = 72;
const REVEAL_WIDTH = CONFIG_WIDTH + DELETE_WIDTH; /* Config + Delete */
const SNAP_THRESHOLD = REVEAL_WIDTH / 2;

type WebhookRowProps = {
  webhook: Webhook;
  unreadCount: number;
  onSelect: () => void;
  onConfig: () => void;
  onDelete: () => void;
};

function WebhookRow({
  webhook,
  unreadCount,
  onSelect,
  onConfig,
  onDelete,
}: WebhookRowProps) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ x: number; offset: number } | null>(null);
  const movedEnough = useRef(false);

  const onPointerDown = (e: React.PointerEvent) => {
    movedEnough.current = false;
    const target = e.target as HTMLElement;
    if (
      target.closest?.("button.webhook-row-config") ||
      target.closest?.("button.webhook-row-delete")
    ) {
      return;
    }
    if (e.pointerType === "mouse") e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragStart.current = { x: e.clientX, offset };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
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

  const onConfigClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onConfig();
  };

  const onDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete();
  };

  const sliderStyle: React.CSSProperties = {
    transform: `translateX(${offset}px)`,
    transition: dragging ? "none" : "transform 0.15s ease-out",
  };

  return (
    <li className="webhook-row-wrap">
      <div
        className="webhook-row-slider"
        style={sliderStyle}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="list-item webhook-row-main">
          <div className="list-item-content">
            <div className="list-item-title">{webhook.name}</div>
            {webhook.description && (
              <div className="list-item-meta">{webhook.description}</div>
            )}
          </div>
          {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
        </div>
        <button
          type="button"
          className="webhook-row-config"
          onClick={onConfigClick}
          aria-label="Configure webhook"
        >
          Config
        </button>
        <button
          type="button"
          className="webhook-row-delete"
          onClick={onDeleteClick}
          aria-label="Delete webhook"
        >
          Delete
        </button>
      </div>
    </li>
  );
}

const RETENTION_OPTIONS = [
  { days: 1, label: "1 day" },
  { days: 2, label: "2 days" },
  { days: 7, label: "1 week" },
  { days: 14, label: "2 weeks" },
  { days: 30, label: "1 month" },
  { days: 60, label: "2 months" },
  { days: 90, label: "3 months" },
] as const;
const RETENTION_DAYS_SET = new Set(RETENTION_OPTIONS.map((o) => o.days));

type WebhookConfigPanelProps = {
  ulid: string;
  onClose: () => void;
  onSaved: () => void;
  mailHour?: number;
};

function WebhookConfigPanel({
  ulid,
  onClose,
  onSaved,
  mailHour = 8,
}: WebhookConfigPanelProps) {
  const mailHourText = formatMailHour(mailHour);
  const [name, setName] = useState("");
  const [emailFrequency, setEmailFrequency] = useState<string>("never");
  const [retentionDays, setRetentionDays] = useState<number>(7);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    fetch(`/webhooks/${ulid}`, { credentials: "include" })
      .then((r) => r.json())
      .then(
        (data: {
          name?: string;
          policy?: { email_schedule?: string; retention_days?: number };
        }) => {
          setName(data.name ?? "");
          const p = data.policy ?? {};
          const e = p.email_schedule ?? "never";
          setEmailFrequency(e === "each" || e === "daily" ? e : "never");
          const r = p.retention_days;
          setRetentionDays(
            typeof r === "number" && RETENTION_DAYS_SET.has(r) ? r : 7,
          );
        },
      )
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [ulid]);

  const handleSave = () => {
    setSaving(true);
    fetch(`/webhooks/${ulid}`, {
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
    return (
      <div className="webhook-config-overlay" onClick={onClose}>
        <div
          className="webhook-config-panel"
          onClick={(e) => e.stopPropagation()}
        >
          <p style={{ color: "var(--text-secondary)" }}>Loading…</p>
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
          <h3 style={{ margin: 0, fontSize: 18 }}>Config: {name || ulid}</h3>
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
            htmlFor="email-frequency"
            style={{
              display: "block",
              fontSize: 12,
              color: "var(--text-secondary)",
              marginBottom: 4,
            }}
          >
            Email frequency
          </label>
          <select
            id="email-frequency"
            value={emailFrequency}
            onChange={(e) => setEmailFrequency(e.target.value)}
            className="input"
            style={{ width: "100%", cursor: "pointer" }}
          >
            <option value="never">Never</option>
            <option value="each">Each alert</option>
            <option value="daily">Daily alerts ({mailHourText})</option>
          </select>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label
            htmlFor="retention-days"
            style={{
              display: "block",
              fontSize: 12,
              color: "var(--text-secondary)",
              marginBottom: 4,
            }}
          >
            Keep events
          </label>
          <select
            id="retention-days"
            value={retentionDays}
            onChange={(e) => setRetentionDays(Number(e.target.value))}
            className="input"
            style={{ width: "100%", cursor: "pointer" }}
          >
            {RETENTION_OPTIONS.map((o) => (
              <option key={o.days} value={o.days}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

type Props = {
  onSelectWebhook: (ulid: string) => void;
  onAddWebhook: () => void;
  mailHour?: number;
};

let cachedWebhooks: Webhook[] | null = null;

export default function WebhooksList({
  onSelectWebhook,
  onAddWebhook,
  mailHour = 8,
}: Props) {
  const [webhooks, setWebhooks] = useState<Webhook[]>(cachedWebhooks ?? []);
  const [unreadByWebhook, setUnreadByWebhook] = useState<
    Record<string, number>
  >({});
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(cachedWebhooks === null);
  const [configUlid, setConfigUlid] = useState<string | null>(null);

  const setWebhooksAndCache = useCallback((wh: Webhook[]) => {
    cachedWebhooks = wh;
    setWebhooks(wh);
  }, []);

  const fetchWebhooks = useCallback(() => {
    return fetch("/webhooks", { credentials: "include" })
      .then((r) => r.json())
      .then((wh) => {
        setWebhooksAndCache(wh.webhooks ?? []);
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
        setEvents(ev.events ?? []);
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
      if (data.events) {
        setEvents(data.events as EventItem[]);
      }
    });
    return unsubscribe;
  }, []);

  // Still poll webhooks separately (they change less frequently)
  useEffect(() => {
    const interval = setInterval(fetchWebhooks, 5 * 60 * 1000); // Poll webhooks every 5 minutes
    return () => clearInterval(interval);
  }, [fetchWebhooks]);

  const getOrderedWebhooks = () => {
    const lastEvent = new Map<string, number>();
    for (const e of events) {
      const t = lastEvent.get(e.webhook_ulid);
      if (t == null || e.created_at > t)
        lastEvent.set(e.webhook_ulid, e.created_at);
    }
    return [...webhooks].sort((a, b) => {
      const ta = lastEvent.get(a.ulid) ?? 0;
      const tb = lastEvent.get(b.ulid) ?? 0;
      return tb - ta;
    });
  };

  const handleDelete = useCallback(
    (ulid: string) => {
      setConfigUlid(null);
      setWebhooksAndCache(webhooks.filter((w) => w.ulid !== ulid));
      fetch(`/webhooks/${ulid}`, {
        method: "DELETE",
        credentials: "include",
      }).then(() => {
        fetchData();
      });
    },
    [webhooks, setWebhooksAndCache, fetchData],
  );

  const handleConfig = useCallback((ulid: string) => {
    setConfigUlid(ulid);
  }, []);

  if (loading) {
    return (
      <div style={{ padding: 24, color: "var(--text-secondary)" }}>Loading webhooks…</div>
    );
  }

  const ordered = getOrderedWebhooks();

  return (
    <div className="screen">
      <ul className="list">
        {ordered.map((w) => (
          <WebhookRow
            key={w.ulid}
            webhook={w}
            unreadCount={unreadByWebhook[w.ulid] ?? 0}
            onSelect={() => onSelectWebhook(w.ulid)}
            onConfig={() => handleConfig(w.ulid)}
            onDelete={() => handleDelete(w.ulid)}
          />
        ))}
      </ul>
      {configUlid && (
        <WebhookConfigPanel
          ulid={configUlid}
          onClose={() => setConfigUlid(null)}
          onSaved={() => {
            setConfigUlid(null);
            fetchData();
          }}
          mailHour={mailHour}
        />
      )}
      <div className="webhooks-list-theme">
        <p className="webhooks-list-theme-label">Theme</p>
        <ThemeChooser endpoint="/settings/me" />
      </div>
      <button
        type="button"
        className="fab"
        onClick={onAddWebhook}
        title="Create webhook"
      >
        +
      </button>
    </div>
  );
}
