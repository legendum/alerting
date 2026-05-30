import { useFilter, useSwipeToReveal } from "pues/base/objects";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { encodeEventCursor } from "../../lib/eventCursor.js";
import { EVENT_PAGE_SIZE } from "../../lib/eventTimeline.js";
import { formatTime } from "../../lib/timeFormat.js";
import { alertEventMatchesFilter } from "../eventFilter";
import { type Event as BaseEvent, mergeEvents } from "../eventHelpers";
import { linkifyBody } from "../linkify.js";
import { onEventsUpdate } from "../messages";
import { queueAction } from "../offlineActions";
import {
  eventListSettleKey,
  useEventTimelineScroll,
} from "../useEventTimelineScroll";
import InboxWebhookPill from "./InboxWebhookPill";

type Event = BaseEvent & { webhook_ulid: string; webhook_name: string };

type CachedInbox = { events: Event[]; hasMore: boolean };
let cachedInbox: CachedInbox | null = null;

type Props = {
  onBack: () => void;
  onEventsMarkedSeen?: () => void;
  filterQuery: string;
  profileTimezone?: string | null;
};

type InboxEventRowProps = {
  event: Event;
  profileTimezone: string | null;
  onDelete: (eventId: number, webhookUlid: string) => void;
};

function InboxEventRow({
  event,
  onDelete,
  profileTimezone,
}: InboxEventRowProps) {
  const { sliderStyle, slideHandlers, handleClick } = useSwipeToReveal({
    actionCount: 1,
  });

  return (
    <li className="row-wrap">
      <div className="row-slider" style={sliderStyle} {...slideHandlers}>
        <div className="pues-row-main" onClick={() => handleClick(() => {})}>
          <div
            className="list-item list-item--no-border"
            style={{ opacity: event.read_at ? 0.8 : 1 }}
          >
            <div className="list-item-content">
              <InboxWebhookPill
                webhookUlid={event.webhook_ulid}
                name={event.webhook_name}
              />
              <div className="list-item-title">{event.title ?? "Alert"}</div>
              {event.body && (
                <div
                  className="list-item-meta"
                  dangerouslySetInnerHTML={{ __html: linkifyBody(event.body) }}
                />
              )}
              <div className="list-item-meta event-row-time">
                {formatTime(event.created_at, profileTimezone)}
              </div>
            </div>
            {event.read_at == null && (
              <span className="unread-dot" title="Unread" />
            )}
          </div>
        </div>
        <button
          type="button"
          className="row-delete"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(event.id, event.webhook_ulid);
          }}
          aria-label="Delete event"
        >
          Delete
        </button>
      </div>
    </li>
  );
}

export default function Inbox({
  onBack,
  onEventsMarkedSeen,
  filterQuery,
  profileTimezone = null,
}: Props) {
  const [events, setEvents] = useState<Event[]>(cachedInbox?.events ?? []);
  const [loading, setLoading] = useState(!cachedInbox);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(cachedInbox?.hasMore ?? true);
  const reqIdRef = useRef(0);

  const matchEvent = useMemo(
    () => (event: Event, q: string) =>
      alertEventMatchesFilter(event, q, profileTimezone),
    [profileTimezone],
  );
  const { active: filterActive, visibleRows: visibleEvents } = useFilter(
    events,
    filterQuery,
    matchEvent,
  );
  const isFiltering = filterQuery.trim().length > 0;

  const updateCache = useCallback((patch: Partial<CachedInbox>) => {
    const prev = cachedInbox ?? { events: [], hasMore: true };
    cachedInbox = { ...prev, ...patch };
  }, []);

  const {
    scrollRef,
    topSentinelRef,
    capturePrependHeight,
    stickToBottom,
    shouldStickOnAppend,
    bindLoadOlder,
    finishLoadOlder,
  } = useEventTimelineScroll({
    settleKey: eventListSettleKey(events),
    canLoadOlder: hasMore && !isFiltering && events.length > 0,
    loading,
    loadingMore,
  });

  const loadOlder = useCallback(() => {
    const oldest = events[0];
    if (!oldest) return;
    const myReq = ++reqIdRef.current;
    setLoadingMore(true);
    const cursor = encodeEventCursor(oldest.created_at, oldest.id);
    fetch(
      `/api/alerts?limit=${EVENT_PAGE_SIZE}&cursor=${encodeURIComponent(cursor)}`,
      {
        credentials: "include",
      },
    )
      .then((r) => r.json())
      .then((d: { events?: Event[]; has_more?: boolean }) => {
        if (reqIdRef.current !== myReq) return;
        const more = d.has_more ?? false;
        const older = d.events ?? [];
        if (older.length === 0) {
          setHasMore(more);
          return;
        }
        capturePrependHeight();
        setEvents((prev) => {
          const next = mergeEvents(older, prev);
          updateCache({ events: next, hasMore: more });
          return next;
        });
        setHasMore(more);
      })
      .catch(() => {})
      .finally(() => {
        finishLoadOlder();
        if (reqIdRef.current === myReq) setLoadingMore(false);
      });
  }, [capturePrependHeight, events, finishLoadOlder, updateCache]);

  useEffect(() => {
    bindLoadOlder(loadOlder);
  }, [bindLoadOlder, loadOlder]);

  const fetchFirstPage = useCallback(() => {
    const myReq = ++reqIdRef.current;
    return fetch(`/api/alerts?limit=${EVENT_PAGE_SIZE}`, {
      credentials: "include",
    })
      .then((r) => r.json())
      .then((d: { events?: Event[]; has_more?: boolean }) => {
        if (reqIdRef.current !== myReq) return;
        const list = d.events ?? [];
        const more = d.has_more ?? false;
        setEvents(list);
        setHasMore(more);
        updateCache({ events: list, hasMore: more });
        stickToBottom();
        const unreadIds = list
          .filter((e) => e.read_at == null)
          .map((e) => e.id);
        if (unreadIds.length > 0) {
          const now = Math.floor(Date.now() / 1000);
          requestAnimationFrame(() => {
            fetch("/api/alerts/seen", {
              method: "PUT",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ event_ids: unreadIds }),
            })
              .then(() => {
                if (reqIdRef.current !== myReq) return;
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
  }, [onEventsMarkedSeen, stickToBottom, updateCache]);

  useEffect(() => {
    if (!cachedInbox) setLoading(true);
    fetchFirstPage().finally(() => {
      setLoading(false);
      stickToBottom();
    });
  }, [fetchFirstPage, stickToBottom]);

  useEffect(() => {
    const unsubscribe = onEventsUpdate((data) => {
      if (data.events) {
        const newEvents = data.events as Event[];
        if (shouldStickOnAppend()) stickToBottom();
        setEvents((prev) => mergeEvents(prev, newEvents));
        setHasMore(data.has_more ?? false);
      }
    });
    return unsubscribe;
  }, [shouldStickOnAppend, stickToBottom]);

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
    <div className="screen screen--detail app-detail-body screen--timeline">
      <div className="screen-header">
        <button
          type="button"
          className="pues-object-detail-back"
          onClick={onBack}
        >
          ◀ Back
        </button>
        <h2 className="screen-title">All Alerts</h2>
      </div>
      <div className="events-timeline-scroll" ref={scrollRef}>
        <div ref={topSentinelRef} aria-hidden="true" />
        {loadingMore && (
          <p className="screen-loading screen-loading--compact">
            Loading earlier…
          </p>
        )}
        {!isFiltering &&
          !loading &&
          !loadingMore &&
          !hasMore &&
          events.length > 0 && (
            <p className="empty-state-hint">Beginning of alerts.</p>
          )}
        <ul className="list">
          {visibleEvents.map((e) => (
            <InboxEventRow
              key={`${e.webhook_ulid}-${e.id}`}
              event={e}
              profileTimezone={profileTimezone}
              onDelete={deleteEvent}
            />
          ))}
        </ul>
        {loading && (
          <p className="screen-loading screen-loading--compact">Loading…</p>
        )}
        {!loading && events.length === 0 && (
          <div
            style={{
              padding: 24,
              color: "var(--pues-text-secondary)",
              textAlign: "center",
            }}
          >
            No events yet.
          </div>
        )}
        {!loading &&
          filterActive &&
          events.length > 0 &&
          visibleEvents.length === 0 && (
            <p className="empty-state-hint">No matches.</p>
          )}
      </div>
    </div>
  );
}
