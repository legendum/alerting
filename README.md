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

## Quota and daily reset

Users get **100 quota per day** for free. Quota is used when a webhook with the default (basic) policy fires. It resets at **midnight in the user’s timezone** (set in Settings).

A housekeeping job must run regularly so that each user’s quota is reset on their local midnight:

- **Script:** `scripts/reset-quota-daily.ts`
- **What it does:** For each token, computes “today” in the token’s timezone (or UTC if unset). If the token hasn’t been reset for that date yet, it sets `quota_basic = 100` and records the date.
- **Run via cron** at least once per day; running every hour is recommended so all timezones are covered.

Example (run every hour):

```bash
0 * * * * cd /path/to/alert && bun run scripts/reset-quota-daily.ts
```

The script is idempotent and adds the `last_quota_reset_date` column to `tokens` if it’s missing (e.g. on an existing DB before this was added).

## Scripts

- `bun run dev` — build web + run server with hot reload (port 3030)
- `bun run start` — build web + run server
- `bun run build:web` — build frontend to `dist/`
- `bun run scripts/create-coupon.ts [quota_basic] [quota_extra]` — create a coupon (admin)
- `bun run scripts/reset-quota-daily.ts` — reset daily quota for all tokens (run via cron; see “Quota and daily reset” above)

## Structure

- `src/api` — API server (Bun.serve), routes and handlers
- `src/web` — React frontend (mobile-first PWA)
- `src/lib` — config, db, auth, email/FCM stubs
- `config/alert.yaml` — app and FCM config (gitignored; use `config/alert.example.yaml` as template)
- `data/alert.db` — SQLite DB (gitignored)
- `schema.sql` — DB schema

## Trigger a webhook

After creating a webhook, copy its URL (e.g. `http://localhost:3000/w/01ABC...`) and call it:

```bash
curl -X POST http://localhost:3030/w/YOUR_ULID -H "Content-Type: application/json" -d '{"title":"Test","body":"Hello"}'
```
