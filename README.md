# Alert

PWA to create webhooks and receive alerts as push notifications. See [SPEC.md](./SPEC.md) and [REST.md](./REST.md).

## Setup

```bash
bun install
cp config/alert.example.yaml config/alert.yaml   # optional; edit with your domain and FCM config (see FCM.md)
bun run build:web
bun run dev
```

Open http://localhost:3030. Request a login link with your email; use the link (or paste the token) to log in.

## Quota and weekly reset

Users get **100 quota per week** for free (resets 7 days after the last reset). Each webhook event consumes one from that pool; when the weekly 100 is used, quota from coupon redemptions is used. The app shows a single **Quota** number (basic + extra).

A housekeeping job must run regularly so that tokens due for a reset get their quota refilled:

- **Script:** `scripts/reset-quota-weekly.ts`
- **What it does:** For each token, if `quota_reset` is null or ≥7 days have passed since the last reset, it sets `quota_basic = 100` and `quota_reset = now`. Rolling window only — no calendar day or midnight.
- **Run via cron** at least once per day (e.g. daily).

Example (run daily):

```bash
0 0 * * * cd /path/to/alert && bun run scripts/reset-quota-weekly.ts
```

The script is idempotent and adds the `quota_reset` column to `tokens` if it’s missing (e.g. on an existing DB before this was added).

## Event retention

Events are listed only for the last 7 days (or each webhook’s `policy.retention_days`). To **delete** old events from the DB so it doesn’t grow forever, run:

- **Script:** `scripts/delete-old-events.ts`
- **What it does:** For each webhook, deletes `webhook_events` rows with `created_at` older than that webhook’s `policy.retention_days` (default 7).
- **Run via cron** (e.g. daily): `0 3 * * * cd /path/to/alert && bun run scripts/delete-old-events.ts`

## Secrets

The `secrets/` folder is gitignored. Put credential files there and reference them via `.env` (see `.env.example`). Do not commit these files.

### `firebase-service-account.json`

Firebase service account key used by the server to send FCM push notifications.

- **Where to get it:** Firebase Console → Project settings → Service accounts → Generate new private key.
- **Format:** Standard Google service account JSON, e.g.:
  ```json
  {
    "type": "service_account",
    "project_id": "your-project-id",
    "private_key_id": "...",
    "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
    "client_email": "firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com",
    "client_id": "...",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    ...
  }
  ```
- **Set in .env:** `ALERT_FIREBASE_SERVICE_ACCOUNT_PATH=./secrets/firebase-service-account.json`

### `firebase_client-keypair.json`

VAPID keypair for web push (used by the PWA and service worker to register for FCM).

- **Where to get it:** Firebase Console → Project settings → Cloud Messaging → Web Push certificates → Generate key pair (or import your own). Export or copy the key pair; the app expects a JSON file with the following keys.
- **Format:**
  ```json
  {
    "public_key": "BN...",
    "private_key": "..."
  }
  ```
  Both values are strings (base64-style). The public key is sent to the client; the private key stays on the server and is used by FCM for delivery.
- **Set in .env:** `ALERT_FIREBASE_VAPID_KEYPAIR_PATH=./secrets/firebase_client-keypair.json`

## Scripts

- `bun run dev` — build web + run server with hot reload (port 3030)
- `bun run start` — build web + run server
- `bun run build:web` — build frontend to `dist/`
- `bun run scripts/create-coupon.ts [quota_extra]` — create a coupon (admin); amount is added to token’s quota_extra on redemption
- `bun run scripts/reset-quota-weekly.ts` — reset weekly quota for all tokens (run via cron; see “Quota and weekly reset” above)
- `bun run scripts/delete-old-events.ts` — delete events older than each webhook’s retention_days (run via cron; see “Event retention” above)

## Structure

- `src/api` — API server (Bun.serve), routes and handlers
- `src/web` — React frontend (mobile-first PWA)
- `src/lib` — config, db, auth, logger, email/FCM
- `config/alert.yaml` — app and FCM config (gitignored; use `config/alert.example.yaml` as template). SMTP password can be set via **ALERT_SMTP_PASSWORD** env var instead of in the file.
- `data/alert.db` — SQLite DB (gitignored)
- `log/` — log files (gitignored). `log/alert.log` has all entries; `log/error.log` has errors only. Created on first write.
- `schema.sql` — DB schema

## Trigger a webhook

After creating a webhook, copy its URL (e.g. `http://localhost:3000/w/01ABC...`) and call it:

```bash
curl -X POST http://localhost:3030/w/YOUR_ULID -H "Content-Type: application/json" -d '{"title":"Test","body":"Hello"}'
```
