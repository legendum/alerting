import React, { useState, useEffect, useCallback } from "react";

type Webhook = { ulid: string; name: string; description: string | null; url: string };
type EventItem = { id: number; webhook_ulid: string; read_at: number | null; created_at: number };

type Props = {
  onSelectWebhook: (ulid: string) => void;
  onAddWebhook: () => void;
  onRefreshUser: () => void;
};

export default function WebhooksList({ onSelectWebhook, onAddWebhook, onRefreshUser }: Props) {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [unreadByWebhook, setUnreadByWebhook] = useState<Record<string, number>>({});
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(() => {
    return Promise.all([
      fetch("/webhooks", { credentials: "include" }).then((r) => r.json()),
      fetch("/events", { credentials: "include" }).then((r) => r.json()),
    ])
      .then(([wh, ev]) => {
        setWebhooks(wh.webhooks ?? []);
        setUnreadByWebhook(ev.unread_by_webhook ?? {});
        setEvents(ev.events ?? []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  useEffect(() => {
    const interval = setInterval(fetchData, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const getOrderedWebhooks = () => {
    const byUlid = new Map(webhooks.map((w) => [w.ulid, w]));
    const lastEvent = new Map<string, number>();
    for (const e of events) {
      const t = lastEvent.get(e.webhook_ulid);
      if (t == null || e.created_at > t) lastEvent.set(e.webhook_ulid, e.created_at);
    }
    return [...webhooks].sort((a, b) => {
      const ta = lastEvent.get(a.ulid) ?? 0;
      const tb = lastEvent.get(b.ulid) ?? 0;
      return tb - ta;
    });
  };

  if (loading) {
    return (
      <div style={{ padding: 24, color: "#94a3b8" }}>Loading webhooks…</div>
    );
  }

  const ordered = getOrderedWebhooks();

  return (
    <div className="screen">
      <ul className="list">
        {ordered.map((w) => (
          <li
            key={w.ulid}
            className="list-item"
            onClick={() => onSelectWebhook(w.ulid)}
          >
            <div className="list-item-content">
              <div className="list-item-title">{w.name}</div>
              {w.description && (
                <div className="list-item-meta">{w.description}</div>
              )}
            </div>
            {(unreadByWebhook[w.ulid] ?? 0) > 0 && (
              <span className="badge">{unreadByWebhook[w.ulid]}</span>
            )}
          </li>
        ))}
      </ul>
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
