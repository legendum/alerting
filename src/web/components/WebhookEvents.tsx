import React, { useState, useEffect, useRef, useCallback } from "react";

type Event = {
  id: number;
  title: string | null;
  body: string | null;
  read_at: number | null;
  created_at: number;
};

const PAGE_SIZE = 30;

type Props = { webhookUlid: string; onBack: () => void; onEventsMarkedSeen?: () => void };

export default function WebhookEvents({ webhookUlid, onBack, onEventsMarkedSeen }: Props) {
  const [webhook, setWebhook] = useState<{ name: string; description: string | null } | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [paramsHelpOpen, setParamsHelpOpen] = useState(false);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback((markSeen = true) => {
    return Promise.all([
      fetch(`/webhooks/${webhookUlid}`, { credentials: "include" }).then((r) => (r.ok ? r.json() : null)),
      fetch(`/webhooks/${webhookUlid}/events?limit=${PAGE_SIZE}`, { credentials: "include" }).then((r) => r.json()),
    ]).then(([wh, ev]) => {
      if (wh) setWebhook({ name: wh.name, description: wh.description ?? null });
      const list = ev.events ?? [];
      setEvents(list);
      setHasMore(ev.has_more ?? false);
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
              .then(() => onEventsMarkedSeen?.())
              .catch(() => {});
          });
        }
      }
    });
  }, [webhookUlid, onEventsMarkedSeen]);

  useEffect(() => {
    setLoading(true);
    fetchData(true).catch(() => {}).finally(() => setLoading(false));
  }, [fetchData]);

  useEffect(() => {
    const interval = setInterval(() => fetchData(false).catch(() => {}), 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || events.length === 0) return;
    const lastId = events[events.length - 1].id;
    setLoadingMore(true);
    fetch(`/webhooks/${webhookUlid}/events?limit=${PAGE_SIZE}&before_id=${lastId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d: { events?: Event[]; has_more?: boolean }) => {
        setEvents((prev) => [...prev, ...(d.events ?? [])]);
        setHasMore(d.has_more ?? false);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  }, [webhookUlid, events.length, hasMore, loadingMore]);

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
    await fetch(`/webhooks/${webhookUlid}/events/${eventId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ read }),
    });
    setEvents((prev) =>
      prev.map((e) =>
        e.id === eventId ? { ...e, read_at: read ? Math.floor(Date.now() / 1000) : null } : e
      )
    );
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts * 1000);
    return d.toLocaleString();
  };

  const title = webhook?.name ?? "Events";
  const description = webhook?.description;

  const screenHeader = (
    <div className="screen-header">
      <button type="button" className="back-btn" onClick={onBack}>
        ← Back
      </button>
      <div className="screen-header-text">
        <h2 className="screen-title">{title}</h2>
        {description && <p className="screen-description">{description}</p>}
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
              textDecoration: "underline",
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
          <li
            key={e.id}
            className="list-item"
            onClick={() => e.read_at == null && markRead(e.id, true)}
            style={{ opacity: e.read_at ? 0.8 : 1 }}
          >
            <div className="list-item-content">
              <div className="list-item-title">{e.title ?? "Alert"}</div>
              {e.body && <div className="list-item-meta">{e.body}</div>}
              <div className="list-item-meta">{formatTime(e.created_at)}</div>
            </div>
            {e.read_at == null && <span className="unread-dot" title="Unread" />}
          </li>
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
