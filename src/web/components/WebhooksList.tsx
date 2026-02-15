import React, { useState, useEffect, useCallback, useRef } from "react";

type Webhook = { ulid: string; name: string; description: string | null; url: string };
type EventItem = { id: number; webhook_ulid: string; read_at: number | null; created_at: number };

const SWIPE_DELETE_WIDTH = 72;
const SWIPE_THRESHOLD = 48;

type WebhookRowProps = {
  webhook: Webhook;
  unreadCount: number;
  onSelect: () => void;
  onDelete: () => void;
};

function WebhookRow({ webhook, unreadCount, onSelect, onDelete }: WebhookRowProps) {
  const [offset, setOffset] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const startRef = useRef({ x: 0, base: 0 });
  const offsetRef = useRef(0);

  const updateOffset = useCallback((clientX: number) => {
    const dx = clientX - startRef.current.x;
    const base = startRef.current.base;
    const next = Math.min(0, Math.max(-SWIPE_DELETE_WIDTH, base + dx));
    offsetRef.current = next;
    setOffset(next);
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      startRef.current = { x: e.clientX, base: revealed ? -SWIPE_DELETE_WIDTH : 0 };
    },
    [revealed]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (e.buttons !== 1 && e.pointerType !== "touch") return;
      updateOffset(e.clientX);
    },
    [updateOffset]
  );

  const handlePointerUp = useCallback(() => {
    const current = offsetRef.current;
    setRevealed(current < -SWIPE_THRESHOLD);
    setOffset(current < -SWIPE_THRESHOLD ? -SWIPE_DELETE_WIDTH : 0);
  }, []);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches[0]) {
        startRef.current = {
          x: e.touches[0].clientX,
          base: revealed ? -SWIPE_DELETE_WIDTH : 0,
        };
      }
    },
    [revealed]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.changedTouches[0]) updateOffset(e.changedTouches[0].clientX);
    },
    [updateOffset]
  );

  const handleTouchEnd = useCallback(() => {
    const current = offsetRef.current;
    setRevealed(current < -SWIPE_THRESHOLD);
    setOffset(current < -SWIPE_THRESHOLD ? -SWIPE_DELETE_WIDTH : 0);
  }, []);

  const handleRowClick = useCallback(
    (e: React.MouseEvent) => {
      if (revealed) {
        setRevealed(false);
        setOffset(0);
      } else {
        onSelect();
      }
    },
    [revealed, onSelect]
  );

  const handleDeleteClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDelete();
    },
    [onDelete]
  );

  const translateX = offset !== 0 ? offset : revealed ? -SWIPE_DELETE_WIDTH : 0;

  return (
    <li className="webhook-row-wrap">
      <div
        className="webhook-row-slider"
        style={{ transform: `translateX(${translateX}px)` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <div className="list-item webhook-row-main" onClick={handleRowClick}>
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
          className="webhook-row-delete"
          onClick={handleDeleteClick}
          aria-label="Delete webhook"
        >
          Delete
        </button>
      </div>
    </li>
  );
}

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

  const handleDelete = useCallback(
    (ulid: string) => {
      fetch(`/webhooks/${ulid}`, { method: "DELETE", credentials: "include" }).then(() => {
        fetchData();
      });
    },
    [fetchData]
  );

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
          <WebhookRow
            key={w.ulid}
            webhook={w}
            unreadCount={unreadByWebhook[w.ulid] ?? 0}
            onSelect={() => onSelectWebhook(w.ulid)}
            onDelete={() => handleDelete(w.ulid)}
          />
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
