import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatTime } from "../../lib/timeFormat.js";
import { mergeEvents } from "../eventHelpers";
import { linkifyBody } from "../linkify.js";
import { onEventsUpdate } from "../messages";
import { queueAction } from "../offlineActions";
import { useSwipeToReveal } from "../useSwipeToReveal";

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

type CachedInbox = { events: Event[]; hasMore: boolean };
let cachedInbox: CachedInbox | null = null;

type Props = { onBack: () => void; onEventsMarkedSeen?: () => void };

type InboxEventRowProps = {
  event: Event;
  onDelete: (eventId: number, webhookUlid: string) => void;
};

function InboxEventRow({ event, onDelete }: InboxEventRowProps) {
  const { sliderStyle, slideHandlers } = useSwipeToReveal();

  const onDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(event.id, event.webhook_ulid);
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
        <div
          className="list-item event-row-main"
          style={{ opacity: event.read_at ? 0.8 : 1 }}
        >
          <div className="list-item-content">
            <div className="list-item-meta">{event.webhook_name}</div>
            <div className="list-item-title">{event.title ?? "Alert"}</div>
            {event.body && (
              <div
                className="list-item-meta"
                dangerouslySetInnerHTML={{ __html: linkifyBody(event.body) }}
              />
            )}
            <div className="list-item-meta">
              {formatTime(event.created_at, null)}
            </div>
          </div>
          {event.read_at == null && (
            <span className="unread-dot" title="Unread" />
          )}
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
  const [events, setEvents] = useState<Event[]>(cachedInbox?.events ?? []);
  const [loading, setLoading] = useState(!cachedInbox);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(cachedInbox?.hasMore ?? true);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const updateCache = useCallback((patch: Partial<CachedInbox>) => {
    const prev = cachedInbox ?? { events: [], hasMore: true };
    cachedInbox = { ...prev, ...patch };
  }, []);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || events.length === 0) return;
    const lastId = events[events.length - 1].id;
    setLoadingMore(true);
    fetch(`/alerts?limit=${PAGE_SIZE}&before_id=${lastId}`, {
      credentials: "include",
    })
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
  }, [events.length, hasMore, loadingMore, updateCache]);

  const fetchFirstPage = useCallback(() => {
    return fetch(`/alerts?limit=${PAGE_SIZE}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d: { events?: Event[]; has_more?: boolean }) => {
        const list = d.events ?? [];
        const more = d.has_more ?? false;
        setEvents(list);
        setHasMore(more);
        updateCache({ events: list, hasMore: more });
        const unreadIds = list
          .filter((e) => e.read_at == null)
          .map((e) => e.id);
        if (unreadIds.length > 0) {
          const now = Math.floor(Date.now() / 1000);
          requestAnimationFrame(() => {
            fetch("/alerts/seen", {
              method: "PUT",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ event_ids: unreadIds }),
            })
              .then(() => {
                setEvents((prev) => {
                  const next = prev.map((e) =>
                    unreadIds.includes(e.id) ? { ...e, read_at: now } : e,
                  );
                  updateCache({ events: next });
                  return next;
                });
                onEventsMarkedSeen?.();
              })
              .catch(() => {});
          });
        }
      })
      .catch(() => {});
  }, [onEventsMarkedSeen, updateCache]);

  useEffect(() => {
    if (!cachedInbox) setLoading(true);
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
      { rootMargin: "200px", threshold: 0 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loading, loadMore]);

  const deleteEvent = async (eventId: number, webhookUlid: string) => {
    setEvents((prev) => {
      const next = prev.filter(
        (e) => !(e.id === eventId && e.webhook_ulid === webhookUlid),
      );
      updateCache({ events: next });
      return next;
    });
    onEventsMarkedSeen?.();

    try {
      await queueAction({
        url: `/webhooks/${webhookUlid}/events/${eventId}`,
        method: "DELETE",
      });
      onEventsMarkedSeen?.();
    } catch (err) {
      console.error("Failed to delete event:", err);
    }
  };

  return (
    <div className="screen">
      <div className="screen-header">
        <button type="button" className="back-btn" onClick={onBack}>
          ◀ Back
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
      {hasMore && events.length > 0 && (
        <div
          ref={sentinelRef}
          style={{ height: 1, visibility: "hidden" }}
          aria-hidden="true"
        />
      )}
      {loadingMore && (
        <div
          style={{
            padding: 12,
            textAlign: "center",
            color: "#94a3b8",
            fontSize: 14,
          }}
        >
          Loading…
        </div>
      )}
      {!loading && events.length === 0 && (
        <div style={{ padding: 24, color: "#94a3b8", textAlign: "center" }}>
          No events yet.
        </div>
      )}
    </div>
  );
}
