-- Alert DB schema (SQLite)
-- Database: data/alert.db

-- One row per email. token_hash is the secret (stored hashed); email is unique.
-- email_new: pending new email for change-email flow; we set email = email_new and clear email_new only when user clicks the confirmation link.
-- quota_basic: decremented by 1 when a webhook with basic default policy fires; reset to 100 at midnight in the token's timezone (tokens.timezone) every day (see scripts/reset-quota-daily.ts).
-- quota_extra: decremented by 1 when a webhook with custom policy fires; +10 daily for all users (so they can try it); users can add more via coupon redemption.
-- last_quota_reset_date: date (YYYY-MM-DD) in the token's timezone when quota_basic was last reset; housekeeping uses this to run daily reset.
CREATE TABLE IF NOT EXISTS tokens (
  token_hash   TEXT PRIMARY KEY,
  email        TEXT NOT NULL UNIQUE,
  email_new    TEXT,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'inactive')),
  timezone     TEXT,
  quota_basic  INTEGER NOT NULL DEFAULT 100,
  quota_extra  INTEGER NOT NULL DEFAULT 0,
  last_quota_reset_date TEXT,
  created_at   INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Coupons: ULID primary key; when redeemed, token_hash and redeemed_at are set (one redemption per coupon).
-- To migrate from old schema: DROP TABLE IF EXISTS coupon_redemptions; DROP TABLE IF EXISTS coupons; then run the CREATE and index below.
CREATE TABLE IF NOT EXISTS coupons (
  id          TEXT NOT NULL PRIMARY KEY,
  token_hash  TEXT REFERENCES tokens(token_hash),
  price       INTEGER NOT NULL DEFAULT 0,
  quota_basic INTEGER NOT NULL DEFAULT 0,
  quota_extra INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  redeemed_at INTEGER
);

-- Webhooks: id is internal auto-increment (used by webhook_events FK); ulid is the public identifier for REST and trigger URL, regenerable if abused.
-- policy: JSON e.g. { "retention_days": 7, "email": "never"|"single"|"daily"|"weekly" }. Housekeeping job deletes events older than retention_days. Paying users can have longer retention and daily/weekly email summaries.
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
CREATE TABLE IF NOT EXISTS webhook_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  webhook_id INTEGER NOT NULL REFERENCES webhooks(id),
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
CREATE INDEX IF NOT EXISTS idx_tokens_status ON tokens(status);
CREATE INDEX IF NOT EXISTS idx_coupons_token_hash ON coupons(token_hash);
CREATE INDEX IF NOT EXISTS idx_webhooks_token_hash ON webhooks(token_hash);
CREATE INDEX IF NOT EXISTS idx_webhooks_ulid ON webhooks(ulid);
CREATE INDEX IF NOT EXISTS idx_webhook_events_webhook_id ON webhook_events(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_webhook_created ON webhook_events(webhook_id, created_at);
CREATE INDEX IF NOT EXISTS idx_webhook_events_token_hash ON webhook_events(token_hash);
CREATE INDEX IF NOT EXISTS idx_webhook_events_token_created ON webhook_events(token_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_token_hash ON fcm_tokens(token_hash);
