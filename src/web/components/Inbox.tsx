import React, { useState, useEffect, useRef, useCallback } from "react";

type Event = {
  id: number;
  webhook_ulid: string;
  webhook_name: string;
  title: string | null;
  body: string | null;
  read_at: number | null;
  created_at: number;
};

const PAGE_SIZE = 30;

type Props = { onBack: () => void };

export default function Inbox({ onBack }: Props) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || events.length === 0) return;
    const lastId = events[events.length - 1].id;
    setLoadingMore(true);
    fetch(`/events?limit=${PAGE_SIZE}&before_id=${lastId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d: { events?: Event[]; has_more?: boolean }) => {
        setEvents((prev) => [...prev, ...(d.events ?? [])]);
        setHasMore(d.has_more ?? false);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  }, [events.length, hasMore, loadingMore]);

  const fetchFirstPage = useCallback(() => {
    return fetch(`/events?limit=${PAGE_SIZE}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d: { events?: Event[]; has_more?: boolean }) => {
        setEvents(d.events ?? []);
        setHasMore(d.has_more ?? false);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchFirstPage().finally(() => setLoading(false));
  }, [fetchFirstPage]);

  useEffect(() => {
    const interval = setInterval(fetchFirstPage, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchFirstPage]);

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

  const formatTime = (ts: number) => {
    const d = new Date(ts * 1000);
    return d.toLocaleString();
  };

  return (
    <div className="screen">
      <div className="screen-header">
        <button type="button" className="back-btn" onClick={onBack}>
          ← Back
        </button>
        <h2 className="screen-title">Inbox</h2>
      </div>
      <ul className="list">
        {events.map((e) => (
          <li
            key={`${e.webhook_ulid}-${e.id}`}
            className="list-item"
            style={{ opacity: e.read_at ? 0.8 : 1 }}
          >
            <div className="list-item-content">
              <div className="list-item-meta">{e.webhook_name}</div>
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
      {!loading && events.length === 0 && (
        <div style={{ padding: 24, color: "#94a3b8", textAlign: "center" }}>
          No events yet.
        </div>
      )}
    </div>
  );
}
