# Alert

PWA to create webhooks and receive alerts as push notifications. See [SPEC.md](./SPEC.md) and [REST.md](./REST.md).

## Setup

```bash
bun install
cp config/alert.example.yaml config/alert.yaml   # optional; edit with your domain and FCM config (see FCM.md)
bun run build:web
bun run dev
```

Open http://localhost:3000. Request a login link with your email; use the link (or paste the token) to log in.

## Scripts

- `bun run dev` — build web + run server with hot reload
- `bun run start` — build web + run server
- `bun run build:web` — build frontend to `dist/`
- `bun run scripts/create-coupon.ts [quota_basic] [quota_extra]` — create a coupon (admin)

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
curl -X POST http://localhost:3000/w/YOUR_ULID -H "Content-Type: application/json" -d '{"title":"Test","body":"Hello"}'
```
