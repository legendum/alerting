-- Alert DB schema (SQLite)
-- Database: data/alerting.db

-- Users: one row per email. Authenticated via Login with Legendum or Google.
-- Identity from Legendum OAuth uses verified email only (no Legendum account_id stored).
-- google_id: stable Google account ID (sub claim from ID token).
-- quota_basic: reset to 100 every 7 days (see scripts/reset-quota-weekly.ts). Consumed first when a webhook fires.
-- quota_extra: topped up by coupon redemption. Consumed when quota_basic is 0. Displayed quota = quota_basic + quota_extra.
-- quota_reset: Unix epoch (seconds) when quota_basic was last reset.
-- legendum_token: for charging credits via Pay with Legendum.
CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  google_id      TEXT UNIQUE,
  email          TEXT NOT NULL UNIQUE,
  timezone       TEXT,
  quota_basic    INTEGER NOT NULL DEFAULT 100,
  quota_extra    INTEGER NOT NULL DEFAULT 0,
  quota_reset    INTEGER,
  legendum_token TEXT,
  meta           TEXT NOT NULL DEFAULT '{}', -- JSON extension blob (e.g. theme; see pues SPEC §5.1)
  created_at     INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Coupons: ULID primary key; when redeemed, user_id and redeemed_at are set (one redemption per coupon).
-- quota_extra: amount added to the user's quota_extra on redemption.
CREATE TABLE IF NOT EXISTS coupons (
  id          TEXT NOT NULL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id),
  price       INTEGER NOT NULL DEFAULT 0,
  quota_extra INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  redeemed_at INTEGER
);

-- Webhooks: id is internal auto-increment (used by webhook_events FK); ulid is the public identifier for REST and trigger URL.
-- policy: JSON for future use (e.g. retention_days, email_schedule).
-- position: user-defined ordering on the main screen.
CREATE TABLE IF NOT EXISTS webhooks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  ulid        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT,
  policy      TEXT,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Events for each webhook: notification text and read state.
-- user_id denormalized for fast queries without joining.
CREATE TABLE IF NOT EXISTS webhook_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  webhook_id INTEGER NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  title      TEXT,
  body       TEXT,
  read_at    INTEGER,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- FCM tokens for push notifications.
CREATE TABLE IF NOT EXISTS fcm_tokens (
  user_id    INTEGER NOT NULL REFERENCES users(id),
  fcm_token  TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  PRIMARY KEY (user_id, fcm_token)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_coupons_user ON coupons(user_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_user ON webhooks(user_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_ulid ON webhooks(ulid);
CREATE INDEX IF NOT EXISTS idx_webhook_events_webhook ON webhook_events(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_webhook_created ON webhook_events(webhook_id, created_at);
CREATE INDEX IF NOT EXISTS idx_webhook_events_user ON webhook_events(user_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_user_created ON webhook_events(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_user ON fcm_tokens(user_id);

-- Pues migration tracking. Fresh databases created from this final schema
-- already have webhooks.position, so mark the historical add-column migration
-- as applied. Existing databases without position won't match the predicate,
-- so Pues will still run the migration.
CREATE TABLE IF NOT EXISTS migrations (
  migration  TEXT    PRIMARY KEY,
  applied_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

INSERT OR IGNORE INTO migrations (migration)
SELECT '001_add_webhooks_position.sql'
WHERE EXISTS (
  SELECT 1 FROM pragma_table_info('webhooks') WHERE name = 'position'
);
