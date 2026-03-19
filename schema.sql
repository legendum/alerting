-- Alert DB schema (SQLite)
-- Database: data/alert.db

-- One row per email. token_hash is the secret (stored hashed); email is unique.
-- email_new: pending new email for change-email flow; we set email = email_new and clear email_new only when user clicks the confirmation link.
-- quota_basic: reset to 100 every 7 days (see scripts/reset-quota-weekly.ts). Consumed first when a webhook fires.
-- quota_extra: topped up by coupon redemption. Consumed when quota_basic is 0. Displayed quota = quota_basic + quota_extra.
-- quota_reset: Unix epoch (seconds) when quota_basic was last reset; housekeeping uses this for weekly reset.
CREATE TABLE IF NOT EXISTS tokens (
  token_hash   TEXT PRIMARY KEY,
  email        TEXT NOT NULL UNIQUE,
  email_new    TEXT,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'inactive')),
  timezone     TEXT,
  quota_basic  INTEGER NOT NULL DEFAULT 100,
  quota_extra  INTEGER NOT NULL DEFAULT 0,
  quota_reset  INTEGER,
  legendum_token TEXT,
  created_at   INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Coupons: ULID primary key; when redeemed, token_hash and redeemed_at are set (one redemption per coupon).
-- quota_extra: amount added to the token's quota_extra on redemption.
CREATE TABLE IF NOT EXISTS coupons (
  id          TEXT NOT NULL PRIMARY KEY,
  token_hash  TEXT REFERENCES tokens(token_hash),
  price       INTEGER NOT NULL DEFAULT 0,
  quota_extra INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  redeemed_at INTEGER
);

-- Webhooks: id is internal auto-increment (used by webhook_events FK); ulid is the public identifier for REST and trigger URL, regenerable if abused.
-- policy: JSON for future use (e.g. retention_days, email_schedule). Not implemented yet.
CREATE TABLE IF NOT EXISTS webhooks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash  TEXT NOT NULL REFERENCES tokens(token_hash),
  ulid        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT,
  policy      TEXT,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Events for each webhook: notification text and read state (for in-app list).
-- token_hash denormalized so we can query "events for this token in the last 7 days" without joining (quick unread counts and inbox).
-- Deleting a webhook cascades to delete its events.
CREATE TABLE IF NOT EXISTS webhook_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  webhook_id INTEGER NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL REFERENCES tokens(token_hash),
  title      TEXT,
  body       TEXT,
  read_at    INTEGER,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- FCM tokens for push notifications, keyed by token_hash.
CREATE TABLE IF NOT EXISTS fcm_tokens (
  token_hash TEXT NOT NULL REFERENCES tokens(token_hash),
  fcm_token  TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  PRIMARY KEY (token_hash, fcm_token)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_coupons_token_hash ON coupons(token_hash);
CREATE INDEX IF NOT EXISTS idx_webhooks_token_hash ON webhooks(token_hash);
CREATE INDEX IF NOT EXISTS idx_webhooks_ulid ON webhooks(ulid);
CREATE INDEX IF NOT EXISTS idx_webhook_events_webhook_id ON webhook_events(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_webhook_created ON webhook_events(webhook_id, created_at);
CREATE INDEX IF NOT EXISTS idx_webhook_events_token_hash ON webhook_events(token_hash);
CREATE INDEX IF NOT EXISTS idx_webhook_events_token_created ON webhook_events(token_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_token_hash ON fcm_tokens(token_hash);
