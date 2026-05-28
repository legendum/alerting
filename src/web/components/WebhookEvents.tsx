import { Dialog } from "pues/base/objects";
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
  webhook_ulid?: string;
  title: string | null;
  body: string | null;
  read_at: number | null;
  created_at: number;
};

const PAGE_SIZE = 30;

type CachedWebhookEvents = {
  webhook: { label: string; description: string | null } | null;
  events: Event[];
  hasMore: boolean;
};
const eventsCache = new Map<string, CachedWebhookEvents>();

type Props = {
  webhookUlid: string;
  onBack: () => void;
  onEventsMarkedSeen?: () => void;
};

const BACK_IGNORE_MS = 450;

type EventRowProps = {
  event: Event;
  onMarkRead: (eventId: number, read: boolean) => void;
  onDelete: (eventId: number) => void;
};

function EventRow({ event, onMarkRead, onDelete }: EventRowProps) {
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
        <div
          className="list-item event-row-main"
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

type WebhookInstructionsDialogProps = {
  title: string;
  description: string | null | undefined;
  webhookUrl: string;
  onClose: () => void;
};

function WebhookInstructionsDialog({
  title,
  description,
  webhookUrl,
  onClose,
}: WebhookInstructionsDialogProps) {
  const [copied, setCopied] = useState(false);
  const getExample = `${webhookUrl}?title=Hello&body=World`;
  const postExampleBody = JSON.stringify(
    { title: "Hello", body: "World" },
    null,
    2,
  );

  const copyUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Dialog title={title} onClose={onClose}>
      {description ? (
        <p style={{ margin: "0 0 12px", color: "var(--pues-text-secondary)" }}>
          {description}
        </p>
      ) : null}
      <p style={{ margin: "0 0 8px", color: "var(--pues-text-secondary)" }}>
        Trigger this URL to create alerts. Optional <code>title</code> and{" "}
        <code>body</code> customize the notification.
      </p>
      <input
        className="input"
        readOnly
        value={webhookUrl}
        style={{ fontFamily: "monospace", fontSize: 13, width: "100%" }}
      />
      <div className="form-button-row form-button-row--end">
        <button
          type="button"
          className="btn"
          onClick={copyUrl}
          style={
            copied
              ? {
                  background: "var(--pues-success)",
                  color: "var(--pues-on-accent)",
                }
              : undefined
          }
        >
          {copied ? "Copied" : "Copy URL"}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Done
        </button>
      </div>
      <div
        style={{
          marginTop: 16,
          marginBottom: 8,
          fontSize: 11,
          color: "var(--pues-text-secondary)",
        }}
      >
        GET
      </div>
      <pre className="webhook-instructions-code">{getExample}</pre>
      <div
        style={{
          marginTop: 12,
          marginBottom: 8,
          fontSize: 11,
          color: "var(--pues-text-secondary)",
        }}
      >
        POST (JSON)
      </div>
      <pre className="webhook-instructions-code">{postExampleBody}</pre>
    </Dialog>
  );
}

export default function WebhookEvents({
  webhookUlid,
  onBack,
  onEventsMarkedSeen,
}: Props) {
  const cached = eventsCache.get(webhookUlid);
  const [webhook, setWebhook] = useState<{
    label: string;
    description: string | null;
  } | null>(cached?.webhook ?? null);
  const [events, setEvents] = useState<Event[]>(cached?.events ?? []);
  const [loading, setLoading] = useState(!cached);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(cached?.hasMore ?? true);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const mountedAtRef = useRef(Date.now());
  const [webhookDialogOpen, setWebhookDialogOpen] = useState(false);
  const onEventsMarkedSeenRef = useRef(onEventsMarkedSeen);
  onEventsMarkedSeenRef.current = onEventsMarkedSeen;

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
        const webhookData = wh
          ? { label: wh.label, description: wh.description ?? null }
          : null;
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

  // Listen for events updates from service worker
  useEffect(() => {
    const unsubscribe = onEventsUpdate((data) => {
      if (data.events) {
        // Filter and merge events for this specific webhook
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

  const title = webhook?.label ?? (loading ? "Loading…" : "Webhook");
  const description = webhook?.description;

  const handleBack = () => {
    if (Date.now() - mountedAtRef.current < BACK_IGNORE_MS) return;
    onBack();
  };

  const webhookUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/w/${webhookUlid}`;

  const screenHeader = (
    <div className="screen-header">
      <button type="button" className="back-btn" onClick={handleBack}>
        ◀ Back
      </button>
      <button
        type="button"
        className="screen-header-webhook-link"
        onClick={() => setWebhookDialogOpen(true)}
        disabled={loading}
        title={webhookUrl}
        aria-haspopup="dialog"
      >
        {title}
      </button>
    </div>
  );

  const webhookDialog = webhookDialogOpen ? (
    <WebhookInstructionsDialog
      title={title}
      description={description}
      webhookUrl={webhookUrl}
      onClose={() => setWebhookDialogOpen(false)}
    />
  ) : null;

  if (loading) {
    return (
      <div className="screen">
        {screenHeader}
        {webhookDialog}
        <div style={{ padding: 24, color: "var(--pues-text-secondary)" }}>
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      {screenHeader}
      {webhookDialog}
      <ul className="list">
        {events.map((e) => (
          <EventRow
            key={e.id}
            event={e}
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
    </div>
  );
}
