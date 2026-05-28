import { useCallback, useEffect, useRef, useState } from "react";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { formatTime } from "../../lib/timeFormat.js";
import { mergeEvents } from "../eventHelpers";
import { linkifyBody } from "../linkify.js";
import { onEventsUpdate } from "../messages";
import { queueAction } from "../offlineActions";
import { useSwipeToReveal } from "../useSwipeToReveal";

const PAGE_SIZE = 30;
const eventsCache = new Map();
const BACK_IGNORE_MS = 450;
function EventRow({ event, webhookUlid, onMarkRead, onDelete }) {
  const { sliderStyle, slideHandlers } = useSwipeToReveal({
    onTap: () => {
      if (event.read_at == null) onMarkRead(event.id, true);
    },
  });
  const onDeleteClick = (e) => {
    e.stopPropagation();
    onDelete(event.id);
  };
  return _jsx("li", {
    className: "event-row-wrap",
    children: _jsxs("div", {
      className: "event-row-slider",
      style: sliderStyle,
      onPointerDown: slideHandlers.onPointerDown,
      onPointerMove: slideHandlers.onPointerMove,
      onPointerUp: slideHandlers.onPointerUp,
      onPointerCancel: slideHandlers.onPointerCancel,
      children: [
        _jsxs("div", {
          className: "list-item event-row-main",
          style: { opacity: event.read_at ? 0.8 : 1 },
          children: [
            _jsxs("div", {
              className: "list-item-content",
              children: [
                _jsx("div", {
                  className: "list-item-title",
                  children: event.title ?? "Alert",
                }),
                event.body &&
                  _jsx("div", {
                    className: "list-item-meta",
                    dangerouslySetInnerHTML: {
                      __html: linkifyBody(event.body),
                    },
                  }),
                _jsx("div", {
                  className: "list-item-meta event-row-time",
                  children: formatTime(event.created_at, null),
                }),
              ],
            }),
            event.read_at == null &&
              _jsx("span", { className: "unread-dot", title: "Unread" }),
          ],
        }),
        _jsx("button", {
          type: "button",
          className: "event-row-delete",
          onClick: onDeleteClick,
          "aria-label": "Delete event",
          children: "Delete",
        }),
      ],
    }),
  });
}
export default function WebhookEvents({
  webhookUlid,
  onBack,
  onEventsMarkedSeen,
}) {
  const cached = eventsCache.get(webhookUlid);
  const [webhook, setWebhook] = useState(cached?.webhook ?? null);
  const [events, setEvents] = useState(cached?.events ?? []);
  const [loading, setLoading] = useState(!cached);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(cached?.hasMore ?? true);
  const sentinelRef = useRef(null);
  const mountedAtRef = useRef(Date.now());
  const [copied, setCopied] = useState(false);
  const [paramsHelpOpen, setParamsHelpOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [editDescription, setEditDescription] = useState("");
  const [savingDescription, setSavingDescription] = useState(false);
  const copiedTimeoutRef = useRef(null);
  const nameInputRef = useRef(null);
  const descriptionInputRef = useRef(null);
  const onEventsMarkedSeenRef = useRef(onEventsMarkedSeen);
  onEventsMarkedSeenRef.current = onEventsMarkedSeen;
  const updateCache = useCallback(
    (patch) => {
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
        fetch(`/webhooks/${webhookUlid}`, { credentials: "include" }).then(
          (r) => (r.ok ? r.json() : null),
        ),
        fetch(`/webhooks/${webhookUlid}/events?limit=${PAGE_SIZE}`, {
          credentials: "include",
        }).then((r) => r.json()),
      ]).then(([wh, ev]) => {
        const webhookData = wh
          ? { name: wh.name, description: wh.description ?? null }
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
            .filter((e) => e.read_at == null)
            .map((e) => e.id);
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
        const newEvents = data.events;
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
      .then((d) => {
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
  const markRead = async (eventId, read) => {
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
  const deleteEvent = async (eventId) => {
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
    const onKeyDown = (e) => {
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
  const screenHeader = _jsxs("div", {
    className: "screen-header",
    children: [
      _jsx("button", {
        type: "button",
        className: "back-btn",
        onClick: handleBack,
        children: "\u25C0 Back",
      }),
      _jsxs("div", {
        className: "screen-header-text",
        children: [
          editingName
            ? _jsx("input", {
                ref: nameInputRef,
                type: "text",
                className: "screen-title",
                value: editName,
                onChange: (e) => setEditName(e.target.value),
                onBlur: saveName,
                onKeyDown: (e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.target.blur();
                  } else if (e.key === "Escape") {
                    cancelEditName();
                    nameInputRef.current?.blur();
                  }
                },
                disabled: savingName,
                style: {
                  display: "block",
                  width: "100%",
                  margin: 0,
                  padding: 0,
                  border: "1px solid var(--pues-border-strong)",
                  borderRadius: 4,
                  background: "var(--pues-bg-surface)",
                  color: "inherit",
                  font: "inherit",
                },
                "aria-label": "Webhook name",
              })
            : _jsx("h2", {
                className: "screen-title",
                onClick: webhook ? startEditingName : undefined,
                role: webhook ? "button" : undefined,
                tabIndex: webhook ? 0 : undefined,
                onKeyDown: webhook
                  ? (e) =>
                      (e.key === "Enter" || e.key === " ") && startEditingName()
                  : undefined,
                style: webhook ? { cursor: "pointer" } : undefined,
                title: webhook ? "Click to edit name" : undefined,
                children: title,
              }),
          editingDescription
            ? _jsx("input", {
                ref: descriptionInputRef,
                type: "text",
                className: "screen-description",
                value: editDescription,
                onChange: (e) => setEditDescription(e.target.value),
                onBlur: saveDescription,
                onKeyDown: (e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.target.blur();
                  } else if (e.key === "Escape") {
                    cancelEditDescription();
                    descriptionInputRef.current?.blur();
                  }
                },
                disabled: savingDescription,
                placeholder: "Description (optional)",
                style: {
                  display: "block",
                  width: "100%",
                  margin: 0,
                  marginTop: 4,
                  padding: 0,
                  border: "1px solid var(--pues-border-strong)",
                  borderRadius: 4,
                  background: "var(--pues-bg-surface)",
                  color: "inherit",
                  font: "inherit",
                },
                "aria-label": "Webhook description",
              })
            : webhook
              ? _jsx("p", {
                  className: "screen-description",
                  onClick: startEditingDescription,
                  onKeyDown: (e) =>
                    (e.key === "Enter" || e.key === " ") &&
                    startEditingDescription(),
                  style: {
                    cursor: "pointer",
                    marginTop: 4,
                    minHeight: description ? undefined : "1.5em",
                  },
                  title: description
                    ? "Click to edit description"
                    : "Click to add description",
                  children: description || "Add description",
                })
              : description
                ? _jsx("p", {
                    className: "screen-description",
                    style: { marginTop: 4 },
                    children: description,
                  })
                : null,
        ],
      }),
    ],
  });
  if (loading) {
    return _jsxs("div", {
      className: "screen",
      children: [
        screenHeader,
        _jsx("div", {
          style: { padding: 24, color: "var(--pues-text-secondary)" },
          children: "Loading\u2026",
        }),
      ],
    });
  }
  const webhookUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/w/${webhookUlid}`;
  const getExample = `${webhookUrl}?title=Hello&body=World`;
  const postExampleBody = JSON.stringify(
    { title: "Hello", body: "World" },
    null,
    2,
  );
  const copyUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
    setCopied(true);
    copiedTimeoutRef.current = setTimeout(() => {
      setCopied(false);
      copiedTimeoutRef.current = null;
    }, 1500);
  };
  return _jsxs("div", {
    className: "screen",
    children: [
      screenHeader,
      _jsxs("div", {
        className: "form",
        style: {
          padding: "12px 16px",
          borderBottom: "1px solid var(--pues-border-default)",
          gap: 8,
        },
        children: [
          _jsxs("div", {
            style: { fontSize: 12, color: "var(--pues-text-secondary)" },
            children: [
              "Webhook URL:",
              " ",
              _jsx("button", {
                type: "button",
                onClick: () => setParamsHelpOpen(true),
                style: {
                  background: "none",
                  border: "none",
                  padding: 0,
                  color: "var(--pues-accent-light)",
                  cursor: "pointer",
                  font: "inherit",
                },
                children: 'send "title" and "body" params',
              }),
            ],
          }),
          paramsHelpOpen &&
            _jsx("div", {
              className: "params-help-overlay",
              onClick: () => setParamsHelpOpen(false),
              children: _jsxs("div", {
                className: "params-help-dialog",
                onClick: (e) => e.stopPropagation(),
                children: [
                  _jsx("button", {
                    type: "button",
                    className: "params-help-close",
                    onClick: () => setParamsHelpOpen(false),
                    "aria-label": "Close",
                    children: "\u00D7",
                  }),
                  _jsx("div", {
                    style: {
                      marginBottom: 12,
                      fontWeight: 600,
                      color: "var(--pues-text-primary)",
                    },
                    children: "Example",
                  }),
                  _jsx("div", {
                    style: {
                      marginBottom: 8,
                      fontSize: 11,
                      color: "var(--pues-text-secondary)",
                    },
                    children: "GET",
                  }),
                  _jsx("pre", {
                    className: "params-help-code",
                    children: getExample,
                  }),
                  _jsx("div", {
                    style: {
                      marginTop: 12,
                      marginBottom: 8,
                      fontSize: 11,
                      color: "var(--pues-text-secondary)",
                    },
                    children: "POST (JSON)",
                  }),
                  _jsx("pre", {
                    className: "params-help-code",
                    children: postExampleBody,
                  }),
                ],
              }),
            }),
          _jsxs("div", {
            style: { display: "flex", gap: 8, alignItems: "center" },
            children: [
              _jsx("input", {
                className: "input",
                readOnly: true,
                value: webhookUrl,
                style: { flex: 1, fontFamily: "monospace", fontSize: 13 },
              }),
              _jsx("button", {
                type: "button",
                className: "btn",
                onClick: copyUrl,
                style: {
                  flexShrink: 0,
                  ...(copied
                    ? {
                        background: "var(--pues-success)",
                        color: "var(--pues-on-accent)",
                      }
                    : {}),
                },
                children: copied ? "Copied" : "Copy",
              }),
            ],
          }),
        ],
      }),
      _jsx("ul", {
        className: "list",
        children: events.map((e) =>
          _jsx(
            EventRow,
            {
              event: e,
              webhookUlid: webhookUlid,
              onMarkRead: markRead,
              onDelete: deleteEvent,
            },
            e.id,
          ),
        ),
      }),
      hasMore &&
        events.length > 0 &&
        _jsx("div", {
          ref: sentinelRef,
          style: { height: 1, visibility: "hidden" },
          "aria-hidden": "true",
        }),
      loadingMore &&
        _jsx("div", {
          style: {
            padding: 12,
            textAlign: "center",
            color: "var(--pues-text-secondary)",
            fontSize: 14,
          },
          children: "Loading\u2026",
        }),
      events.length === 0 &&
        _jsx("div", {
          style: {
            padding: 24,
            color: "var(--pues-text-secondary)",
            textAlign: "center",
          },
          children: "No events yet. Trigger the webhook URL to see them here.",
        }),
    ],
  });
}
