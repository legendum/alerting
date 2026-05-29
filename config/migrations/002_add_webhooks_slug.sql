ALTER TABLE webhooks ADD COLUMN slug TEXT;

-- Stable unique slug per row (matches ulid-based fallback for legacy names).
UPDATE webhooks SET slug = lower(ulid) WHERE slug IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_webhooks_user_slug ON webhooks(user_id, slug);
