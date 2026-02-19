import React, { useState, useEffect, useRef, useCallback } from "react";
import { linkifyBody } from "../linkify.js";
import { formatTime } from "../../lib/timeFormat.js";
import { useSwipeToReveal } from "../useSwipeToReveal";
import { onEventsUpdate } from "../messages";
import { queueAction } from "../offlineActions";
import { mergeEvents } from "../eventHelpers";

type Event = {
  id: number;
  title: string | null;
  body: string | null;
  read_at: number | null;
  created_at: number;
};

const PAGE_SIZE = 30;

type CachedWebhookEvents = {
  webhook: { name: string; description: string | null } | null;
  events: Event[];
  hasMore: boolean;
};
const eventsCache = new Map<string, CachedWebhookEvents>();

type Props = { webhookUlid: string; onBack: () => void; onEventsMarkedSeen?: () => void };

const BACK_IGNORE_MS = 450;

type EventRowProps = {
  event: Event;
  webhookUlid: string;
  onMarkRead: (eventId: number, read: boolean) => void;
  onDelete: (eventId: number) => void;
};

function EventRow({ event, webhookUlid, onMarkRead, onDelete }: EventRowProps) {
  const { sliderStyle, slideHandlers } = useSwipeToReveal({
    onTap: () => {
      if (event.read_at == null) onMarkRead(event.id, true);
    },
  });

  const onDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(event.id);
  };

  return (
    <li className="event-row-wrap">
      <div
        className="event-row-slider"
        style={sliderStyle}
        onPointerDown={slideHandlers.onPointerDown}
        onPointerMove={slideHandlers.onPointerMove}
        onPointerUp={slideHandlers.onPointerUp}
        onPointerCancel={slideHandlers.onPointerCancel}
      >
        <div className="list-item event-row-main" style={{ opacity: event.read_at ? 0.8 : 1 }}>
          <div className="list-item-content">
            <div className="list-item-title">{event.title ?? "Alert"}</div>
            {event.body && <div className="list-item-meta" dangerouslySetInnerHTML={{ __html: linkifyBody(event.body) }} />}
            <div className="list-item-meta event-row-time">{formatTime(event.created_at, null)}</div>
          </div>
          {event.read_at == null && <span className="unread-dot" title="Unread" />}
        </div>
        <button
          type="button"
          className="event-row-delete"
          onClick={onDeleteClick}
          aria-label="Delete event"
        >
          Delete
        </button>
      </div>
    </li>
  );
}

export default function WebhookEvents({ webhookUlid, onBack, onEventsMarkedSeen }: Props) {
  const cached = eventsCache.get(webhookUlid);
  const [webhook, setWebhook] = useState<{ name: string; description: string | null } | null>(cached?.webhook ?? null);
  const [events, setEvents] = useState<Event[]>(cached?.events ?? []);
  const [loading, setLoading] = useState(!cached);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(cached?.hasMore ?? true);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const mountedAtRef = useRef(Date.now());
  const [copied, setCopied] = useState(false);
  const [paramsHelpOpen, setParamsHelpOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [editDescription, setEditDescription] = useState("");
  const [savingDescription, setSavingDescription] = useState(false);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const descriptionInputRef = useRef<HTMLInputElement>(null);
  const onEventsMarkedSeenRef = useRef(onEventsMarkedSeen);
  onEventsMarkedSeenRef.current = onEventsMarkedSeen;

  const updateCache = useCallback((patch: Partial<CachedWebhookEvents>) => {
    const prev = eventsCache.get(webhookUlid) ?? { webhook: null, events: [], hasMore: true };
    eventsCache.set(webhookUlid, { ...prev, ...patch });
  }, [webhookUlid]);

  const fetchData = useCallback((markSeen = true) => {
    return Promise.all([
      fetch(`/webhooks/${webhookUlid}`, { credentials: "include" }).then((r) => (r.ok ? r.json() : null)),
      fetch(`/webhooks/${webhookUlid}/events?limit=${PAGE_SIZE}`, { credentials: "include" }).then((r) => r.json()),
    ]).then(([wh, ev]) => {
      const webhookData = wh ? { name: wh.name, description: wh.description ?? null } : null;
      if (webhookData) setWebhook(webhookData);
      const list = ev.events ?? [];
      const more = ev.has_more ?? false;
      setEvents(list);
      setHasMore(more);
      updateCache({ webhook: webhookData ?? eventsCache.get(webhookUlid)?.webhook ?? null, events: list, hasMore: more });
      if (markSeen) {
        const unreadIds = list.filter((e) => e.read_at == null).map((e) => e.id);
        if (unreadIds.length > 0) {
          requestAnimationFrame(() => {
            fetch(`/webhooks/${webhookUlid}/events/seen`, {
              method: "PUT",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ event_ids: unreadIds }),
            })
              .then(() => onEventsMarkedSeenRef.current?.())
              .catch(() => {});
          });
        }
      }
    });
  }, [webhookUlid, updateCache]);

  useEffect(() => {
    fetchData(true).catch(() => {}).finally(() => setLoading(false));
  }, [fetchData]);

  // Listen for events updates from service worker
  useEffect(() => {
    const unsubscribe = onEventsUpdate((data) => {
      if (data.events) {
        // Filter and merge events for this specific webhook
        const newEvents = data.events as Event[];
        setEvents((prev) => mergeEvents(prev, newEvents, (e) => e.webhook_ulid === webhookUlid));
      }
    });
    return unsubscribe;
  }, [webhookUlid]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || events.length === 0) return;
    const lastId = events[events.length - 1].id;
    setLoadingMore(true);
    fetch(`/webhooks/${webhookUlid}/events?limit=${PAGE_SIZE}&before_id=${lastId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d: { events?: Event[]; has_more?: boolean }) => {
        const more = d.has_more ?? false;
        setEvents((prev) => {
          const next = [...prev, ...(d.events ?? [])];
          updateCache({ events: next, hasMore: more });
          return next;
        });
        setHasMore(more);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  }, [webhookUlid, events.length, hasMore, loadingMore, updateCache]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loading) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "200px", threshold: 0 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loading, loadMore]);

  const markRead = async (eventId: number, read: boolean) => {
    setEvents((prev) => {
      const next = prev.map((e) =>
        e.id === eventId ? { ...e, read_at: read ? Math.floor(Date.now() / 1000) : null } : e
      );
      updateCache({ events: next });
      return next;
    });

    try {
      await queueAction({
        url: `/webhooks/${webhookUlid}/events/${eventId}`,
        method: "PATCH",
        body: { read },
      });
    } catch (err) {
      setEvents((prev) => {
        const next = prev.map((e) =>
          e.id === eventId ? { ...e, read_at: read ? null : Math.floor(Date.now() / 1000) } : e
        );
        updateCache({ events: next });
        return next;
      });
      console.error("Failed to mark event as read:", err);
    }
  };

  const deleteEvent = async (eventId: number) => {
    setEvents((prev) => {
      const next = prev.filter((e) => e.id !== eventId);
      updateCache({ events: next });
      return next;
    });
    onEventsMarkedSeenRef.current?.();

    try {
      await queueAction({
        url: `/webhooks/${webhookUlid}/events/${eventId}`,
        method: "DELETE",
      });
    } catch (err) {
      console.error("Failed to delete event:", err);
    }
  };

  const title = webhook?.name ?? "Events";
  const description = webhook?.description;

  const startEditingName = () => {
    if (!webhook) return;
    setEditName(webhook.name);
    setEditingName(true);
  };

  useEffect(() => {
    if (editingName) nameInputRef.current?.focus();
  }, [editingName]);

  useEffect(() => {
    if (editingDescription) descriptionInputRef.current?.focus();
  }, [editingDescription]);

  useEffect(() => {
    if (!paramsHelpOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setParamsHelpOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [paramsHelpOpen]);

  const saveName = async () => {
    const trimmed = editName.trim();
    if (!trimmed || trimmed === webhook?.name || savingName) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      const res = await fetch(`/webhooks/${webhookUlid}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (res.ok) {
        setWebhook((prev) => {
          const next = prev ? { ...prev, name: trimmed } : null;
          if (next) updateCache({ webhook: next });
          return next;
        });
        setEditingName(false);
      }
    } finally {
      setSavingName(false);
    }
  };

  const cancelEditName = () => {
    setEditName(webhook?.name ?? "");
    setEditingName(false);
  };

  const startEditingDescription = () => {
    if (!webhook) return;
    setEditDescription(webhook.description ?? "");
    setEditingDescription(true);
  };

  const saveDescription = async () => {
    const trimmed = editDescription.trim();
    const current = webhook?.description ?? "";
    if (trimmed === current || savingDescription) {
      setEditingDescription(false);
      return;
    }
    setSavingDescription(true);
    try {
      const res = await fetch(`/webhooks/${webhookUlid}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: trimmed || null }),
      });
      if (res.ok) {
        setWebhook((prev) => {
          const next = prev ? { ...prev, description: trimmed || null } : null;
          if (next) updateCache({ webhook: next });
          return next;
        });
        setEditingDescription(false);
      }
    } finally {
      setSavingDescription(false);
    }
  };

  const cancelEditDescription = () => {
    setEditDescription(webhook?.description ?? "");
    setEditingDescription(false);
  };

  const handleBack = () => {
    if (Date.now() - mountedAtRef.current < BACK_IGNORE_MS) return;
    onBack();
  };

  const screenHeader = (
    <div className="screen-header">
      <button type="button" className="back-btn" onClick={handleBack}>
        ← Back
      </button>
      <div className="screen-header-text">
        {editingName ? (
          <input
            ref={nameInputRef}
            type="text"
            className="screen-title"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              } else if (e.key === "Escape") {
                cancelEditName();
                nameInputRef.current?.blur();
              }
            }}
            disabled={savingName}
            style={{
              display: "block",
              width: "100%",
              margin: 0,
              padding: 0,
              border: "1px solid #475569",
              borderRadius: 4,
              background: "#1e293b",
              color: "inherit",
              font: "inherit",
            }}
            aria-label="Webhook name"
          />
        ) : (
          <h2
            className="screen-title"
            onClick={webhook ? startEditingName : undefined}
            role={webhook ? "button" : undefined}
            tabIndex={webhook ? 0 : undefined}
            onKeyDown={webhook ? (e) => (e.key === "Enter" || e.key === " ") && startEditingName() : undefined}
            style={webhook ? { cursor: "pointer" } : undefined}
            title={webhook ? "Click to edit name" : undefined}
          >
            {title}
          </h2>
        )}
        {editingDescription ? (
          <input
            ref={descriptionInputRef}
            type="text"
            className="screen-description"
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            onBlur={saveDescription}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              } else if (e.key === "Escape") {
                cancelEditDescription();
                descriptionInputRef.current?.blur();
              }
            }}
            disabled={savingDescription}
            placeholder="Description (optional)"
            style={{
              display: "block",
              width: "100%",
              margin: 0,
              marginTop: 4,
              padding: 0,
              border: "1px solid #475569",
              borderRadius: 4,
              background: "#1e293b",
              color: "inherit",
              font: "inherit",
            }}
            aria-label="Webhook description"
          />
        ) : webhook ? (
          <p
            className="screen-description"
            onClick={startEditingDescription}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && startEditingDescription()}
            style={{ cursor: "pointer", marginTop: 4, minHeight: description ? undefined : "1.5em" }}
            title={description ? "Click to edit description" : "Click to add description"}
          >
            {description || "Add description"}
          </p>
        ) : description ? (
          <p className="screen-description" style={{ marginTop: 4 }}>{description}</p>
        ) : null}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="screen">
        {screenHeader}
        <div style={{ padding: 24, color: "#94a3b8" }}>Loading…</div>
      </div>
    );
  }

  const webhookUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/w/${webhookUlid}`;
  const getExample = `${webhookUrl}?title=Hello&body=World`;
  const postExampleBody = JSON.stringify({ title: "Hello", body: "World" }, null, 2);
  const copyUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
    setCopied(true);
    copiedTimeoutRef.current = setTimeout(() => {
      setCopied(false);
      copiedTimeoutRef.current = null;
    }, 1500);
  };

  return (
    <div className="screen">
      {screenHeader}
      <div className="form" style={{ padding: "12px 16px", borderBottom: "1px solid #334155", gap: 8 }}>
        <div style={{ fontSize: 12, color: "#94a3b8" }}>
          Webhook URL:{" "}
          <button
            type="button"
            onClick={() => setParamsHelpOpen(true)}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              color: "#60a5fa",
              cursor: "pointer",
              font: "inherit",
            }}
          >
            send &quot;title&quot; and &quot;body&quot; params
          </button>
        </div>
        {paramsHelpOpen && (
          <div className="params-help-overlay" onClick={() => setParamsHelpOpen(false)}>
            <div className="params-help-dialog" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="params-help-close"
                onClick={() => setParamsHelpOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
              <div style={{ marginBottom: 12, fontWeight: 600, color: "#e2e8f0" }}>Example</div>
              <div style={{ marginBottom: 8, fontSize: 11, color: "#94a3b8" }}>GET</div>
              <pre className="params-help-code">{getExample}</pre>
              <div style={{ marginTop: 12, marginBottom: 8, fontSize: 11, color: "#94a3b8" }}>POST (JSON)</div>
              <pre className="params-help-code">{postExampleBody}</pre>
            </div>
          </div>
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            className="input"
            readOnly
            value={webhookUrl}
            style={{ flex: 1, fontFamily: "monospace", fontSize: 13 }}
          />
          <button
            type="button"
            className="btn"
            onClick={copyUrl}
            style={{
              flexShrink: 0,
              ...(copied ? { background: "#16a34a", color: "#fff" } : {}),
            }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <ul className="list">
        {events.map((e) => (
          <EventRow
            key={e.id}
            event={e}
            webhookUlid={webhookUlid}
            onMarkRead={markRead}
            onDelete={deleteEvent}
          />
        ))}
      </ul>
      {hasMore && events.length > 0 && <div ref={sentinelRef} style={{ height: 1, visibility: "hidden" }} aria-hidden="true" />}
      {loadingMore && <div style={{ padding: 12, textAlign: "center", color: "#94a3b8", fontSize: 14 }}>Loading…</div>}
      {events.length === 0 && (
        <div style={{ padding: 24, color: "#94a3b8", textAlign: "center" }}>
          No events yet. Trigger the webhook URL to see them here.
        </div>
      )}
    </div>
  );
}
