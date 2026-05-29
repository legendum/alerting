import {
  ObjectDetail,
  RenameTitle,
  type UseResourceResult,
  useFilter,
  useSwipeToReveal,
} from "pues/base/objects";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatTime } from "../../lib/timeFormat.js";
import { alertEventMatchesFilter } from "../eventFilter";
import { type Event, mergeEvents } from "../eventHelpers";
import { linkifyBody } from "../linkify.js";
import { onEventsUpdate } from "../messages";
import { queueAction } from "../offlineActions";
import type { WebhookEntry } from "../types";
import { webhookPillClassNames } from "../webhookPill";
import CopyIcon from "./CopyIcon";
import WebhookHelpIcon from "./WebhookHelpIcon";
import WebhookTriggerDialog, {
  webhookTriggerUrl,
} from "./WebhookTriggerDialog";

const PAGE_SIZE = 30;
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
  onMarkRead: (eventId: number, read: boolean) => void;
  onDelete: (eventId: number) => void;
};

function EventRow({
  event,
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
              if (event.read_at == null) onMarkRead(event.id, true);
            })
          }
        >
          <div
            className="list-item list-item--no-border"
            style={{ opacity: event.read_at ? 0.8 : 1 }}
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
  const sentinelRef = useRef<HTMLDivElement>(null);
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

  const fetchData = useCallback(
    (markSeen = true) => {
      return Promise.all([
        fetch(`/api/webhooks/${webhookUlid}`, { credentials: "include" }).then(
          (r) => (r.ok ? r.json() : null),
        ),
        fetch(`/webhooks/${webhookUlid}/events?limit=${PAGE_SIZE}`, {
          credentials: "include",
        }).then((r) => r.json()),
      ]).then(([wh, ev]) => {
        const webhookData = wh ? { label: wh.label } : null;
        if (webhookData) setWebhook(webhookData);
        const list = ev.events ?? [];
        const more = ev.has_more ?? false;
        setEvents(list);
        setHasMore(more);
        updateCache({
          webhook: webhookData ?? eventsCache.get(webhookUlid)?.webhook ?? null,
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
    [webhookUlid, updateCache],
  );

  useEffect(() => {
    fetchData(true)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [fetchData]);

  useEffect(() => {
    const unsubscribe = onEventsUpdate((data) => {
      if (data.events) {
        const newEvents = data.events as Event[];
        setEvents((prev) =>
          mergeEvents(prev, newEvents, (e) => e.webhook_ulid === webhookUlid),
        );
      }
    });
    return unsubscribe;
  }, [webhookUlid]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || events.length === 0) return;
    const lastId = events[events.length - 1].id;
    setLoadingMore(true);
    fetch(
      `/webhooks/${webhookUlid}/events?limit=${PAGE_SIZE}&before_id=${lastId}`,
      { credentials: "include" },
    )
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
      { rootMargin: "200px", threshold: 0 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loading, loadMore]);

  const markRead = async (eventId: number, read: boolean) => {
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
      <ObjectDetail
        className="screen screen--detail"
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
        {loading ? (
          <div style={{ padding: 24, color: "var(--pues-text-secondary)" }}>
            Loading…
          </div>
        ) : (
          <>
            <ul className="list">
              {visibleEvents.map((e) => (
                <EventRow
                  key={e.id}
                  event={e}
                  profileTimezone={profileTimezone}
                  onMarkRead={markRead}
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
                  color: "var(--pues-text-secondary)",
                  fontSize: 14,
                }}
              >
                Loading…
              </div>
            )}
            {events.length === 0 && (
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
          </>
        )}
      </ObjectDetail>
      {webhookDialog}
    </>
  );
}
