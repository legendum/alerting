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
import { Logout } from "pues/base/auth";
import {
  AddButton,
  Dialog,
  DragHandle,
  type UseResourceResult,
  useDelete,
  useDndPositions,
  useEscape,
  useFilter,
  useFilterEnter,
  useSwipeToReveal,
} from "pues/base/objects";
import { ThemeChooser } from "pues/base/theme";
import { type RefObject, useCallback, useEffect, useState } from "react";
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

function WebhookConfigDialog({
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

  const [name, setName] = useState(entry.label ?? "");
  const [emailFrequency, setEmailFrequency] = useState(initialEmail);
  const [retentionDays, setRetentionDays] =
    useState<RetentionDays>(initialRetention);
  const [saving, setSaving] = useState(false);

  const trimmedName = name.trim();
  const canSave = trimmedName.length > 0;

  const handleSave = async () => {
    if (!canSave) return;
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
          label: trimmedName,
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
    <Dialog title="Webhook configuration" onClose={onClose}>
      <section className="pues-dialog-section">
        <h3>Name</h3>
        <input
          id="webhook-name"
          type="text"
          className="pues-dialog-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
          placeholder="Webhook name"
        />
      </section>
      <section className="pues-dialog-section">
        <h3>Email frequency</h3>
        <select
          id="email-frequency"
          value={emailFrequency}
          onChange={(e) => setEmailFrequency(e.target.value)}
          className="pues-dialog-select"
        >
          <option value="never">Never</option>
          <option value="each">Each alert</option>
          <option value="daily">Daily alerts ({mailHourText})</option>
        </select>
      </section>
      <section className="pues-dialog-section">
        <h3>Keep events</h3>
        <select
          id="retention-days"
          value={retentionDays}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (isRetentionDays(next)) setRetentionDays(next);
          }}
          className="pues-dialog-select"
        >
          {RETENTION_OPTIONS.map((o) => (
            <option key={o.days} value={o.days}>
              {o.label}
            </option>
          ))}
        </select>
      </section>
      <div className="form-button-row form-button-row--end">
        <button
          type="button"
          className="pues-btn pues-btn-secondary"
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          type="button"
          className="pues-btn"
          onClick={handleSave}
          disabled={saving || !canSave}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </Dialog>
  );
}

const webhookMatchesFilter = (row: WebhookEntry, q: string): boolean => {
  return String(row.label ?? "")
    .toLowerCase()
    .includes(q.toLowerCase());
};

type Props = {
  resource: UseResourceResult<WebhookEntry>;
  onSelectWebhook: (entry: WebhookEntry) => void;
  onSelectInbox: () => void;
  totalUnread: number;
  /** Bumped when unread counts change (detail/inbox); refetches row badges. */
  unreadVersion: number;
  mailHour?: number;
  filterQuery: string;
  filterInputRef?: RefObject<HTMLInputElement | null>;
};

export default function WebhooksList({
  resource,
  onSelectWebhook,
  onSelectInbox,
  totalUnread,
  unreadVersion,
  mailHour = 8,
  filterQuery,
  filterInputRef,
}: Props) {
  const webhooks = resource.rows;
  const { active: filterActive, visibleRows: filteredWebhooks } = useFilter(
    webhooks,
    filterQuery,
    webhookMatchesFilter,
  );
  const showAllAlerts =
    !filterActive || "all alerts".includes(filterQuery.trim().toLowerCase());

  // Pressing Enter in the filter input opens the first match. When the
  // "All Alerts" row is showing it sits atop the list, so it wins.
  useFilterEnter({
    inputRef: filterInputRef,
    active: filterActive,
    onEnter: () => {
      if (showAllAlerts) {
        onSelectInbox();
      } else if (filteredWebhooks[0]) {
        onSelectWebhook(filteredWebhooks[0]);
      }
    },
  });
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

  useEscape(!!configEntry, () => setConfigEntry(null));
  useEscape(!!deleteEntry, () => setDeleteEntry(null));

  const fetchUnread = useCallback(() => {
    fetch("/api/alerts", { credentials: "include" })
      .then((r) => r.json())
      .then((ev: { unread_by_webhook?: Record<string, number> }) => {
        setUnreadByWebhook(ev.unread_by_webhook ?? {});
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchUnread();
  }, [fetchUnread, unreadVersion]);

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
      {filterActive ? (
        <ul className="list">
          {showAllAlerts ? (
            <AllAlertsRow totalUnread={totalUnread} onSelect={onSelectInbox} />
          ) : null}
          {filteredWebhooks.map((entry) => (
            <StaticWebhookRow
              key={entry.id}
              entry={entry}
              unreadCount={unreadByWebhook[entry.id] ?? 0}
              onSelect={() => onSelectWebhook(entry)}
              onConfig={() => setConfigEntry(entry)}
              onDelete={() => setDeleteEntry(entry)}
            />
          ))}
        </ul>
      ) : (
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
              <AllAlertsRow
                totalUnread={totalUnread}
                onSelect={onSelectInbox}
              />
              {webhooks.map((entry) => (
                <SortableWebhookRow
                  key={entry.id}
                  entry={entry}
                  unreadCount={unreadByWebhook[entry.id] ?? 0}
                  onSelect={() => onSelectWebhook(entry)}
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
      )}

      {!resource.loading && webhooks.length === 0 && !filterActive && (
        <p className="empty-state-hint">
          No webhooks yet. Tap + to create one.
        </p>
      )}

      {filterActive && filteredWebhooks.length === 0 && !showAllAlerts && (
        <p className="empty-state-hint">No matches.</p>
      )}

      <AddButton
        resource="webhooks"
        placeholder="Webhook name"
        onCreated={(row) => setTriggerHelpUlid(String(row.id))}
      />

      <ThemeChooser endpoint="/settings/me" />
      <Logout />

      {configEntry && (
        <WebhookConfigDialog
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
              className="pues-btn pues-btn-secondary"
              onClick={() => setDeleteEntry(null)}
            >
              No
            </button>
            <button type="button" className="pues-btn" onClick={confirmDelete}>
              Yes
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function AllAlertsRow({
  totalUnread,
  onSelect,
}: {
  totalUnread: number;
  onSelect: () => void;
}) {
  return (
    <li className="row-wrap">
      <div className="pues-row-main" onClick={onSelect}>
        <div className="list-item list-item--no-border">
          <DragHandle disabled />
          <div className="list-item-content list-item-content--indent">
            <div className="list-item-title">All Alerts</div>
          </div>
          {totalUnread > 0 && (
            <span className="badge">
              {totalUnread > 99 ? "99+" : totalUnread}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

function StaticWebhookRow({
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
  const { sliderStyle, slideHandlers, reset, handleClick } = useSwipeToReveal({
    actionCount: 2,
  });

  return (
    <li className="row-wrap">
      <div className="row-slider" style={sliderStyle} {...slideHandlers}>
        <div className="pues-row-main" onClick={() => handleClick(onSelect)}>
          <div className="list-item list-item--no-border">
            <DragHandle disabled />
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
