ALTER TABLE webhooks ADD COLUMN position INTEGER NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT
    w.id,
    ROW_NUMBER() OVER (
      PARTITION BY w.user_id
      ORDER BY
        COALESCE(MAX(e.created_at), 0) DESC,
        w.created_at DESC,
        w.id DESC
    ) AS rn
  FROM webhooks w
  LEFT JOIN webhook_events e ON e.webhook_id = w.id
  GROUP BY w.id
)
UPDATE webhooks
SET position = (
  SELECT rn * 1000
  FROM ranked
  WHERE ranked.id = webhooks.id
);
