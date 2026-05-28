import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AddButton,
  Dialog,
  DragHandle,
  type UseResourceResult,
  useDelete,
  useDndPositions,
  useEscape,
  useSwipeToReveal,
} from "pues/base/objects";
import { ThemeChooser } from "pues/base/theme";
import { useCallback, useEffect, useState } from "react";
import { formatMailHour } from "../formatMailHour";
import { onEventsUpdate } from "../messages";
import type { WebhookEntry } from "../types";
import WebhookTriggerDialog, {
  webhookTriggerUrl,
} from "./WebhookTriggerDialog";

const RETENTION_OPTIONS = [
  { days: 1, label: "1 day" },
  { days: 2, label: "2 days" },
  { days: 7, label: "1 week" },
  { days: 14, label: "2 weeks" },
  { days: 30, label: "1 month" },
  { days: 60, label: "2 months" },
  { days: 90, label: "3 months" },
] as const;
type RetentionDays = (typeof RETENTION_OPTIONS)[number]["days"];
const RETENTION_DAYS_SET = new Set<RetentionDays>(
  RETENTION_OPTIONS.map((o) => o.days),
);

function isRetentionDays(value: number): value is RetentionDays {
  return RETENTION_DAYS_SET.has(value as RetentionDays);
}

function parsePolicyField(
  policy: WebhookEntry["policy"],
): Record<string, unknown> {
  if (policy == null) return {};
  if (typeof policy === "string") {
    try {
      return (JSON.parse(policy) as Record<string, unknown>) ?? {};
    } catch {
      return {};
    }
  }
  return policy as Record<string, unknown>;
}

type WebhookConfigPanelProps = {
  entry: WebhookEntry;
  resource: UseResourceResult<WebhookEntry>;
  onClose: () => void;
  mailHour?: number;
};

function WebhookConfigPanel({
  entry,
  resource,
  onClose,
  mailHour = 8,
}: WebhookConfigPanelProps) {
  const mailHourText = formatMailHour(mailHour);
  const p = parsePolicyField(entry.policy);
  const initialEmail =
    p.email_schedule === "each" || p.email_schedule === "daily"
      ? String(p.email_schedule)
      : "never";
  const initialRetention =
    typeof p.retention_days === "number" && isRetentionDays(p.retention_days)
      ? p.retention_days
      : 7;

  const [emailFrequency, setEmailFrequency] = useState(initialEmail);
  const [retentionDays, setRetentionDays] =
    useState<RetentionDays>(initialRetention);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const handleSave = async () => {
    setSaving(true);
    const opId = resource.newOpId();
    try {
      const res = await fetch(`/api/webhooks/${entry.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Op-Id": opId,
        },
        body: JSON.stringify({
          policy: {
            email_schedule: emailFrequency,
            retention_days: retentionDays,
          },
        }),
      });
      if (res.ok) {
        resource.reload();
        onClose();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="webhook-config-overlay" onClick={onClose}>
      <div
        className="webhook-config-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 18 }}>
            Config: {entry.label || entry.id}
          </h3>
          <button
            type="button"
            className="webhook-config-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label
            htmlFor="email-frequency"
            style={{
              display: "block",
              fontSize: 12,
              color: "var(--pues-text-secondary)",
              marginBottom: 4,
            }}
          >
            Email frequency
          </label>
          <select
            id="email-frequency"
            value={emailFrequency}
            onChange={(e) => setEmailFrequency(e.target.value)}
            className="input"
            style={{ width: "100%", cursor: "pointer" }}
          >
            <option value="never">Never</option>
            <option value="each">Each alert</option>
            <option value="daily">Daily alerts ({mailHourText})</option>
          </select>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label
            htmlFor="retention-days"
            style={{
              display: "block",
              fontSize: 12,
              color: "var(--pues-text-secondary)",
              marginBottom: 4,
            }}
          >
            Keep events
          </label>
          <select
            id="retention-days"
            value={retentionDays}
            onChange={(e) => {
              const next = Number(e.target.value);
              if (isRetentionDays(next)) setRetentionDays(next);
            }}
            className="input"
            style={{ width: "100%", cursor: "pointer" }}
          >
            {RETENTION_OPTIONS.map((o) => (
              <option key={o.days} value={o.days}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

type Props = {
  resource: UseResourceResult<WebhookEntry>;
  onSelectWebhook: (id: string) => void;
  mailHour?: number;
};

export default function WebhooksList({
  resource,
  onSelectWebhook,
  mailHour = 8,
}: Props) {
  const webhooks = resource.rows;
  const [unreadByWebhook, setUnreadByWebhook] = useState<
    Record<string, number>
  >({});
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [configEntry, setConfigEntry] = useState<WebhookEntry | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<WebhookEntry | null>(null);
  const [triggerHelpUlid, setTriggerHelpUlid] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 6 } }),
  );

  const dnd = useDndPositions<WebhookEntry>({
    name: "webhooks",
    resource,
  });
  const { del } = useDelete<WebhookEntry>({
    resource,
    resourceName: "webhooks",
  });

  useEscape(!!deleteEntry, () => setDeleteEntry(null));

  const fetchUnread = useCallback(() => {
    fetch("/alerts", { credentials: "include" })
      .then((r) => r.json())
      .then((ev: { unread_by_webhook?: Record<string, number> }) => {
        setUnreadByWebhook(ev.unread_by_webhook ?? {});
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchUnread();
  }, [fetchUnread]);

  useEffect(() => {
    const unsubscribe = onEventsUpdate((data) => {
      if (data.unread_by_webhook) {
        setUnreadByWebhook(data.unread_by_webhook);
      }
    });
    return unsubscribe;
  }, []);

  const confirmDelete = async () => {
    if (!deleteEntry) return;
    await del(deleteEntry.id);
    setDeleteEntry(null);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  };

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragId(null);
      dnd.onDragEnd(event);
    },
    [dnd],
  );

  const draggedEntry = activeDragId
    ? webhooks.find((w) => w.id === activeDragId)
    : null;

  if (resource.loading) {
    return (
      <div style={{ padding: 24, color: "var(--pues-text-secondary)" }}>
        Loading webhooks…
      </div>
    );
  }

  return (
    <div className="screen screen--home">
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={dnd.itemIds.map(String)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="list">
            {webhooks.map((entry) => (
              <SortableWebhookRow
                key={entry.id}
                entry={entry}
                unreadCount={unreadByWebhook[entry.id] ?? 0}
                onSelect={() => onSelectWebhook(String(entry.id))}
                onConfig={() => setConfigEntry(entry)}
                onDelete={() => setDeleteEntry(entry)}
              />
            ))}
          </ul>
        </SortableContext>

        <DragOverlay>
          {draggedEntry ? (
            <div className="pues-drag-overlay">
              <div className="list-item list-item--no-border">
                <DragHandle />
                <div className="list-item-content list-item-content--indent">
                  <div className="list-item-title">{draggedEntry.label}</div>
                </div>
                {(unreadByWebhook[draggedEntry.id] ?? 0) > 0 && (
                  <span className="badge">
                    {unreadByWebhook[draggedEntry.id]}
                  </span>
                )}
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {!resource.loading && webhooks.length === 0 && (
        <p className="empty-state-hint">
          No webhooks yet. Tap + to create one.
        </p>
      )}

      <AddButton
        resource="webhooks"
        placeholder="Webhook name"
        onCreated={(row) => setTriggerHelpUlid(String(row.id))}
      />

      <div className="webhooks-list-theme">
        <p className="webhooks-list-theme-label">Theme</p>
        <ThemeChooser endpoint="/settings/me" />
      </div>

      {configEntry && (
        <WebhookConfigPanel
          entry={configEntry}
          resource={resource}
          onClose={() => setConfigEntry(null)}
          mailHour={mailHour}
        />
      )}

      {triggerHelpUlid && (
        <WebhookTriggerDialog
          webhookUrl={webhookTriggerUrl(triggerHelpUlid)}
          onClose={() => setTriggerHelpUlid(null)}
        />
      )}

      {deleteEntry && (
        <Dialog title="Delete webhook?" onClose={() => setDeleteEntry(null)}>
          <p className="dialog-lede">
            Permanently delete <strong>{deleteEntry.label}</strong> and all its
            alerts?
          </p>
          <div className="form-button-row form-button-row--end">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setDeleteEntry(null)}
            >
              No
            </button>
            <button type="button" className="btn" onClick={confirmDelete}>
              Yes
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function SortableWebhookRow({
  entry,
  unreadCount,
  onSelect,
  onConfig,
  onDelete,
}: {
  entry: WebhookEntry;
  unreadCount: number;
  onSelect: () => void;
  onConfig: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entry.id });

  const { sliderStyle, slideHandlers, reset, handleClick } = useSwipeToReveal({
    actionCount: 2,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <li className="row-wrap" ref={setNodeRef} style={style} {...attributes}>
      <div className="row-slider" style={sliderStyle} {...slideHandlers}>
        <div className="pues-row-main" onClick={() => handleClick(onSelect)}>
          <div className="list-item list-item--no-border">
            <DragHandle listeners={listeners} />
            <div className="list-item-content list-item-content--indent">
              <div className="list-item-title">{entry.label}</div>
            </div>
            {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
          </div>
        </div>
        <button
          type="button"
          className="row-edit"
          onClick={() => {
            reset();
            onConfig();
          }}
        >
          Config
        </button>
        <button type="button" className="row-delete" onClick={onDelete}>
          Delete
        </button>
      </div>
    </li>
  );
}
