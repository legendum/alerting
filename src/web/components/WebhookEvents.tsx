import {
  Dialog,
  ObjectDetail,
  RenameTitle,
  type UseResourceResult,
} from "pues/base/objects";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatTime } from "../../lib/timeFormat.js";
import { mergeEvents } from "../eventHelpers";
import { linkifyBody } from "../linkify.js";
import { onEventsUpdate } from "../messages";
import { queueAction } from "../offlineActions";
import type { WebhookEntry } from "../types";
import { useSwipeToReveal } from "../useSwipeToReveal";
import CopyIcon from "./CopyIcon";
import WebhookHelpIcon from "./WebhookHelpIcon";

type Event = {
  id: number;
  webhook_ulid?: string;
  title: string | null;
  body: string | null;
  read_at: number | null;
  created_at: number;
};

const PAGE_SIZE = 30;
const BACK_IGNORE_MS = 450;
const COPY_ACK_MS = 850;

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
};

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
  webhookUrl: string;
  onClose: () => void;
};

function WebhookInstructionsDialog({
  webhookUrl,
  onClose,
}: WebhookInstructionsDialogProps) {
  const [urlCopiedFlash, setUrlCopiedFlash] = useState(false);
  const copyFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const getExample = `${webhookUrl}?title=Hello&body=World`;
  const postExampleBody = JSON.stringify(
    { title: "Hello", body: "World" },
    null,
    2,
  );

  useEffect(
    () => () => {
      if (copyFlashTimer.current) clearTimeout(copyFlashTimer.current);
    },
    [],
  );

  async function copyWebhookUrl() {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      if (copyFlashTimer.current) clearTimeout(copyFlashTimer.current);
      setUrlCopiedFlash(true);
      copyFlashTimer.current = setTimeout(() => {
        setUrlCopiedFlash(false);
        copyFlashTimer.current = null;
      }, COPY_ACK_MS);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <Dialog title="Trigger webhook" onClose={onClose}>
      <section className="pues-dialog-section">
        <div className="pues-dialog-section-head">
          <h3>Webhook URL</h3>
          {urlCopiedFlash ? (
            <span className="pues-dialog-copy-hint" role="status">
              Copied
            </span>
          ) : null}
        </div>
        <button
          type="button"
          className={`pues-dialog-code-install-wrap${urlCopiedFlash ? " pues-dialog-code--flash" : ""}`}
          onClick={copyWebhookUrl}
          aria-label="Copy webhook URL"
        >
          <span className="pues-dialog-code-install-scroll">{webhookUrl}</span>
          <span className="pues-dialog-code-install-icon" aria-hidden="true">
            <CopyIcon />
          </span>
        </button>
      </section>

      <section className="pues-dialog-section">
        <h3>Optional parameters</h3>
        <p>
          Send <code>title</code> and <code>body</code> as query parameters
          (GET) or JSON fields (POST) to customize the alert.
        </p>
      </section>

      <section className="pues-dialog-section">
        <h3>GET</h3>
        <pre className="pues-dialog-code">{getExample}</pre>
      </section>

      <section className="pues-dialog-section">
        <h3>POST (JSON)</h3>
        <pre className="pues-dialog-code">{postExampleBody}</pre>
      </section>
    </Dialog>
  );
}

export default function WebhookEvents({
  webhookUlid,
  webhooksResource,
  onBack,
  onEventsMarkedSeen,
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

  const webhookUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/w/${webhookUlid}`;
  const webhookPath = `/w/${webhookUlid}`;

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setUrlCopied(true);
    setTimeout(() => setUrlCopied(false), 2000);
  };

  const webhookDialog = webhookDialogOpen ? (
    <WebhookInstructionsDialog
      webhookUrl={webhookUrl}
      onClose={() => setWebhookDialogOpen(false)}
    />
  ) : null;

  const titleNode =
    resourceRow || webhook ? (
      <RenameTitle
        resource={webhooksResource}
        resourceName="webhooks"
        rowId={webhookUlid}
        label={label}
        className="screen-title"
      />
    ) : (
      <span className="screen-title">{label}</span>
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
          </>
        )}
      </ObjectDetail>
      {webhookDialog}
    </>
  );
}
