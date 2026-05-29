import {
  ObjectDetail,
  RenameTitle,
  type UseResourceResult,
  useFilter,
  useSwipeToReveal,
} from "pues/base/objects";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { encodeEventCursor } from "../../lib/eventCursor.js";
import { EVENT_PAGE_SIZE } from "../../lib/eventTimeline.js";
import { formatTime } from "../../lib/timeFormat.js";
import { alertEventMatchesFilter } from "../eventFilter";
import { type Event, mergeEvents } from "../eventHelpers";
import { linkifyBody } from "../linkify.js";
import { onEventsUpdate } from "../messages";
import { queueAction } from "../offlineActions";
import type { WebhookEntry } from "../types";
import {
  eventListSettleKey,
  useEventTimelineScroll,
} from "../useEventTimelineScroll";
import { webhookPillClassNames } from "../webhookPill";
import CopyIcon from "./CopyIcon";
import WebhookHelpIcon from "./WebhookHelpIcon";
import WebhookTriggerDialog, {
  webhookTriggerUrl,
} from "./WebhookTriggerDialog";

const BACK_IGNORE_MS = 450;
type CachedWebhookEvents = {
  webhook: { label: string } | null;
  events: Event[];
  hasMore: boolean;
};
const eventsCache = new Map<string, CachedWebhookEvents>();

type Props = {
  webhookUlid: string;
  webhooksResource: UseResourceResult<WebhookEntry>;
  onBack: () => void;
  onEventsMarkedSeen?: () => void;
  filterQuery: string;
  profileTimezone?: string | null;
};

type EventRowProps = {
  event: Event;
  profileTimezone: string | null;
  showUnread: boolean;
  onMarkRead: (eventId: number, read: boolean) => void;
  onDelete: (eventId: number) => void;
};

function EventRow({
  event,
  showUnread,
  onMarkRead,
  onDelete,
  profileTimezone,
}: EventRowProps) {
  const { sliderStyle, slideHandlers, handleClick } = useSwipeToReveal({
    actionCount: 1,
  });

  return (
    <li className="row-wrap">
      <div className="row-slider" style={sliderStyle} {...slideHandlers}>
        <div
          className="pues-row-main"
          onClick={() =>
            handleClick(() => {
              if (showUnread) onMarkRead(event.id, true);
            })
          }
        >
          <div
            className="list-item list-item--no-border"
            style={{ opacity: showUnread ? 1 : 0.8 }}
          >
            <div className="list-item-content">
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
            {showUnread && <span className="unread-dot" title="Unread" />}
          </div>
        </div>
        <button
          type="button"
          className="row-delete"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(event.id);
          }}
          aria-label="Delete event"
        >
          Delete
        </button>
      </div>
    </li>
  );
}

export default function WebhookEvents({
  webhookUlid,
  webhooksResource,
  onBack,
  onEventsMarkedSeen,
  filterQuery,
  profileTimezone = null,
}: Props) {
  const cached = eventsCache.get(webhookUlid);
  const [webhook, setWebhook] = useState<{ label: string } | null>(
    cached?.webhook ?? null,
  );
  const [events, setEvents] = useState<Event[]>(cached?.events ?? []);
  const [loading, setLoading] = useState(!cached);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(cached?.hasMore ?? true);
  const [stickyUnread, setStickyUnread] = useState<Set<number>>(new Set());
  const seenIdsRef = useRef<Set<number>>(new Set());
  const reqIdRef = useRef(0);
  const mountedAtRef = useRef(Date.now());
  const [webhookDialogOpen, setWebhookDialogOpen] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const onEventsMarkedSeenRef = useRef(onEventsMarkedSeen);
  onEventsMarkedSeenRef.current = onEventsMarkedSeen;

  const resourceRow = webhooksResource.rows.find((w) => w.id === webhookUlid);
  const label =
    resourceRow?.label ?? webhook?.label ?? (loading ? "Loading…" : "Webhook");

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

  const updateCache = useCallback(
    (patch: Partial<CachedWebhookEvents>) => {
      const prev = eventsCache.get(webhookUlid) ?? {
        webhook: null,
        events: [],
        hasMore: true,
      };
      eventsCache.set(webhookUlid, { ...prev, ...patch });
    },
    [webhookUlid],
  );

  const syncWebhookLabel = useCallback(
    (row: WebhookEntry | undefined) => {
      const webhookData = row
        ? { label: row.label?.trim() || "Webhook" }
        : null;
      if (webhookData) setWebhook(webhookData);
      if (webhookData) {
        updateCache({
          webhook: webhookData,
          events: eventsCache.get(webhookUlid)?.events ?? [],
          hasMore: eventsCache.get(webhookUlid)?.hasMore ?? true,
        });
      }
      return webhookData;
    },
    [webhookUlid, updateCache],
  );

  useEffect(() => {
    syncWebhookLabel(resourceRow);
  }, [resourceRow, syncWebhookLabel]);

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

  const fetchData = useCallback(
    (markSeen = true) => {
      const myReq = ++reqIdRef.current;
      syncWebhookLabel(resourceRow);
      return fetch(`/webhooks/${webhookUlid}/events?limit=${EVENT_PAGE_SIZE}`, {
        credentials: "include",
      })
        .then((r) => r.json())
        .then((ev) => {
          if (reqIdRef.current !== myReq) return;
          const list = ev.events ?? [];
          const more = ev.has_more ?? false;
          setEvents(list);
          setHasMore(more);
          const initiallyUnread = list
            .filter((e: Event) => e.read_at == null)
            .map((e: Event) => e.id);
          setStickyUnread((prev) => {
            const next = new Set(prev);
            for (const id of initiallyUnread) next.add(id);
            return next;
          });
          stickToBottom();
          updateCache({
            webhook:
              (resourceRow
                ? { label: resourceRow.label?.trim() || "Webhook" }
                : eventsCache.get(webhookUlid)?.webhook) ?? null,
            events: list,
            hasMore: more,
          });
          if (markSeen) {
            const unreadIds = list
              .filter((e: Event) => e.read_at == null)
              .map((e: Event) => e.id);
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
    },
    [webhookUlid, resourceRow, stickToBottom, syncWebhookLabel, updateCache],
  );

  useEffect(() => {
    reqIdRef.current += 1;
    setLoading(!eventsCache.get(webhookUlid));
    fetchData(true)
      .catch(() => {})
      .finally(() => {
        setLoading(false);
        stickToBottom();
      });
  }, [fetchData, stickToBottom, webhookUlid]);

  useEffect(() => {
    const unsubscribe = onEventsUpdate((data) => {
      if (data.events) {
        const newEvents = data.events as Event[];
        if (shouldStickOnAppend()) stickToBottom();
        const arrivalsForWebhook = newEvents.filter(
          (e) => e.webhook_ulid === webhookUlid,
        );
        setStickyUnread((prev) => {
          let changed = false;
          const next = new Set(prev);
          for (const e of arrivalsForWebhook) {
            if (
              e.read_at == null &&
              !next.has(e.id) &&
              !seenIdsRef.current.has(e.id)
            ) {
              next.add(e.id);
              changed = true;
            }
          }
          return changed ? next : prev;
        });
        setEvents((prev) =>
          mergeEvents(prev, newEvents, (e) => e.webhook_ulid === webhookUlid),
        );
      }
    });
    return unsubscribe;
  }, [shouldStickOnAppend, stickToBottom, webhookUlid]);

  const loadOlder = useCallback(() => {
    const oldest = events[0];
    if (!oldest) return;
    const myReq = reqIdRef.current;
    setLoadingMore(true);
    const cursor = encodeEventCursor(oldest.created_at, oldest.id);
    fetch(
      `/webhooks/${webhookUlid}/events?limit=${EVENT_PAGE_SIZE}&cursor=${encodeURIComponent(cursor)}`,
      { credentials: "include" },
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
  }, [capturePrependHeight, events, finishLoadOlder, updateCache, webhookUlid]);

  useEffect(() => {
    bindLoadOlder(loadOlder);
  }, [bindLoadOlder, loadOlder]);

  const markRead = async (eventId: number, read: boolean) => {
    if (read) {
      seenIdsRef.current.add(eventId);
      setStickyUnread((prev) => {
        if (!prev.has(eventId)) return prev;
        const next = new Set(prev);
        next.delete(eventId);
        return next;
      });
    }
    setEvents((prev) => {
      const next = prev.map((e) =>
        e.id === eventId
          ? { ...e, read_at: read ? Math.floor(Date.now() / 1000) : null }
          : e,
      );
      updateCache({ events: next });
      return next;
    });
    onEventsMarkedSeenRef.current?.();

    try {
      await queueAction({
        url: `/webhooks/${webhookUlid}/events/${eventId}`,
        method: "PATCH",
        body: { read },
      });
      onEventsMarkedSeenRef.current?.();
    } catch (err) {
      setEvents((prev) => {
        const next = prev.map((e) =>
          e.id === eventId
            ? { ...e, read_at: read ? null : Math.floor(Date.now() / 1000) }
            : e,
        );
        updateCache({ events: next });
        return next;
      });
      onEventsMarkedSeenRef.current?.();
      console.error("Failed to mark event as read:", err);
    }
  };

  const deleteEvent = async (eventId: number) => {
    setStickyUnread((prev) => {
      if (!prev.has(eventId)) return prev;
      const next = new Set(prev);
      next.delete(eventId);
      return next;
    });
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
      onEventsMarkedSeenRef.current?.();
    } catch (err) {
      console.error("Failed to delete event:", err);
    }
  };

  const handleBack = () => {
    if (Date.now() - mountedAtRef.current < BACK_IGNORE_MS) return;
    onBack();
  };

  const webhookUrl = webhookTriggerUrl(webhookUlid);
  const webhookPath = `/w/${webhookUlid}`;

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setUrlCopied(true);
    setTimeout(() => setUrlCopied(false), 2000);
  };

  const webhookDialog = webhookDialogOpen ? (
    <WebhookTriggerDialog
      webhookUrl={webhookUrl}
      onClose={() => setWebhookDialogOpen(false)}
    />
  ) : null;

  const titlePillClass = webhookPillClassNames(
    webhookUlid,
    "webhook-pill--header",
  );
  const titleNode =
    resourceRow || webhook ? (
      <RenameTitle
        resource={webhooksResource}
        resourceName="webhooks"
        rowId={webhookUlid}
        label={label}
        className={titlePillClass}
      />
    ) : (
      <span className={titlePillClass}>{label}</span>
    );

  return (
    <>
      <div className="screen screen--detail app-detail-body">
        <ObjectDetail
          className="screen--timeline"
          headerClassName="screen-header"
          onBack={handleBack}
          backLabel="◀ Back"
          backClassName="back-btn"
          title={titleNode}
          subtitle={
            <button
              type="button"
              className="list-url"
              title={
                urlCopied ? "Copied to clipboard" : "Click to copy webhook URL"
              }
              onClick={copyWebhookUrl}
              disabled={loading}
            >
              {webhookPath}
              {urlCopied ? (
                <span className="copied-badge">Copied!</span>
              ) : (
                <CopyIcon />
              )}
            </button>
          }
          actions={
            <button
              type="button"
              className="pues-icon-btn"
              title="Webhook help"
              aria-label="Webhook help"
              onClick={() => setWebhookDialogOpen(true)}
            >
              <WebhookHelpIcon />
            </button>
          }
        >
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
                <EventRow
                  key={e.id}
                  event={e}
                  showUnread={stickyUnread.has(e.id)}
                  profileTimezone={profileTimezone}
                  onMarkRead={markRead}
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
                No events yet. Trigger the webhook URL to see them here.
              </div>
            )}
            {filterActive &&
              events.length > 0 &&
              visibleEvents.length === 0 && (
                <p className="empty-state-hint">No matches.</p>
              )}
          </div>
        </ObjectDetail>
      </div>
      {webhookDialog}
    </>
  );
}
