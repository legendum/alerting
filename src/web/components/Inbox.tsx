import React, { useState, useEffect, useRef, useCallback } from "react";
import { linkifyBody } from "../linkify.js";
import { onEventsUpdate } from "../swMessages";
import { queueAction } from "../offlineActions";
import { mergeEvents } from "../swHelpers";

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

const DELETE_WIDTH = 72;
const SNAP_THRESHOLD = DELETE_WIDTH / 2;

type Props = { onBack: () => void; onEventsMarkedSeen?: () => void };

type InboxEventRowProps = {
  event: Event;
  onDelete: (eventId: number, webhookUlid: string) => void;
};

function InboxEventRow({ event, onDelete }: InboxEventRowProps) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ x: number; offset: number } | null>(null);
  const movedEnough = useRef(false);

  const onPointerDown = (e: React.PointerEvent) => {
    movedEnough.current = false;
    const target = e.target as HTMLElement;
    if (target.closest?.("button.event-row-delete")) {
      return;
    }
    // Allow links to work - don't interfere with link clicks
    if (target.closest?.("a")) {
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
    const next = Math.max(-DELETE_WIDTH, Math.min(0, dragStart.current.offset + dx));
    setOffset(next);
  };

  const onPointerUp = () => {
    if (dragStart.current == null) return;
    const wasRevealed = dragStart.current.offset <= -SNAP_THRESHOLD;
    const snapOpen = offset < -SNAP_THRESHOLD;
    if (!movedEnough.current) {
      if (wasRevealed) setOffset(0);
    } else {
      setOffset(snapOpen ? -DELETE_WIDTH : 0);
    }
    dragStart.current = null;
    setDragging(false);
  };

  const onDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(event.id, event.webhook_ulid);
  };

  const sliderStyle: React.CSSProperties = {
    transform: `translateX(${offset}px)`,
    transition: dragging ? "none" : "transform 0.15s ease-out",
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts * 1000);
    return d.toLocaleString();
  };

  return (
    <li className="event-row-wrap">
      <div
        className="event-row-slider"
        style={sliderStyle}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="list-item event-row-main" style={{ opacity: event.read_at ? 0.8 : 1 }}>
          <div className="list-item-content">
            <div className="list-item-meta">{event.webhook_name}</div>
            <div className="list-item-title">{event.title ?? "Alert"}</div>
            {event.body && <div className="list-item-meta" dangerouslySetInnerHTML={{ __html: linkifyBody(event.body) }} />}
            <div className="list-item-meta">{formatTime(event.created_at)}</div>
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

export default function Inbox({ onBack, onEventsMarkedSeen }: Props) {
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
        const list = d.events ?? [];
        setEvents(list);
        setHasMore(d.has_more ?? false);
        const unreadIds = list.filter((e) => e.read_at == null).map((e) => e.id);
        if (unreadIds.length > 0) {
          const now = Math.floor(Date.now() / 1000);
          requestAnimationFrame(() => {
            fetch("/events/seen", {
              method: "PUT",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ event_ids: unreadIds }),
            })
              .then(() => {
                setEvents((prev) => prev.map((e) => (unreadIds.includes(e.id) ? { ...e, read_at: now } : e)));
                onEventsMarkedSeen?.();
              })
              .catch(() => {});
          });
        }
      })
      .catch(() => {});
  }, [onEventsMarkedSeen]);

  useEffect(() => {
    fetchFirstPage().finally(() => setLoading(false));
  }, [fetchFirstPage]);

  // Listen for events updates from service worker
  useEffect(() => {
    const unsubscribe = onEventsUpdate((data) => {
      if (data.events) {
        // Update events list with new data from service worker
        const newEvents = data.events as Event[];
        setEvents((prev) => mergeEvents(prev, newEvents));
        setHasMore(data.has_more ?? false);
      }
    });
    return unsubscribe;
  }, []);

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

  const deleteEvent = async (eventId: number, webhookUlid: string) => {
    // Optimistically update UI
    setEvents((prev) => prev.filter((e) => !(e.id === eventId && e.webhook_ulid === webhookUlid)));
    onEventsMarkedSeen?.();
    
    // Queue action for background sync (works offline)
    try {
      await queueAction({
        url: `/webhooks/${webhookUlid}/events/${eventId}`,
        method: "DELETE",
      });
    } catch (err) {
      // If action fails, we can't easily revert without refetching
      // The next poll will correct the state
      console.error("Failed to delete event:", err);
    }
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
          <InboxEventRow
            key={`${e.webhook_ulid}-${e.id}`}
            event={e}
            onDelete={deleteEvent}
          />
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
