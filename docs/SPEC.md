# Alert — Product Spec

A minimal PWA: **create webhooks → receive alerts as push notifications**. Users sign in with **Legendum** (OAuth); the server issues a signed session cookie.

---

## 1. What it does

- **User signs in** with Legendum (OAuth) — no passwords.
- **User creates webhooks** — each has a unique trigger URL (`/w/:ulid`). When called, the app creates an alert and sends a **push notification** (FCM).
- **User manages alerts** in the PWA: per-webhook feeds, global inbox, read/unread, draggable webhook order.

We store as little as possible: user account, webhooks, events, and FCM device tokens.

---

## 2. User flows

### 2.1 Auth (Legendum OAuth)

1. **Login**: User taps “Login / Signup” → `GET /auth/login` redirects to Legendum.
2. **Callback**: Legendum redirects to `GET /auth/callback?code=…&state=…` → server exchanges the code, upserts the user by verified email, stores optional `legendum_token`, sets an **HttpOnly session cookie** (`alert_session`), redirects to `/`.
3. **Logout**: `POST /auth/logout` clears the session cookie.

No passwords. Identity is the Legendum-verified email stored on `users`. New users get a default webhook on first login.

### 2.2 Webhooks

1. **Dashboard** (after login): List of webhooks. “Create webhook” → we generate a unique ULID and show the webhook URL, e.g. `https://alerting.app/w/01ARZ3NDEKTSV4RRFFQ69G5FAV`.
2. **Webhook URL** is public and unlisted (no auth required to hit it). Anyone who has the URL can trigger an alert. Optionally: allow a secret query param or header for simple “key” auth later; v1 can be “anyone with URL can trigger.”
3. **When URL is called** (GET or POST): we look up the webhook → find the user → send a **push notification** to that user (via FCM). Request body can be forwarded as notification title/body (e.g. `title`, `message` in JSON) or we use a default “You have an alert.”

### 2.3 Push notifications

1. On first visit (or “Enable notifications”): PWA requests notification permission and registers with **FCM** (Firebase Cloud Messaging).
2. We store the **FCM token** (or subscription) for that user/device so we can send pushes when their webhook is triggered.
3. When a webhook is hit → backend uses FCM to send a push to the user → user sees the notification even when the app is closed.

---

## 3. Data we store (minimal)

**Hierarchy:** A user has webhooks; a webhook has events.

- **users**: `id` (PK), `email` (UNIQUE), optional `google_id`, **timezone**, **quota_basic** (default 100; reset every 7 days; consumed first on trigger), **quota_extra** (from coupons), **quota_reset**, **legendum_token** (for billing link), **meta** (JSON, e.g. theme), `created_at`. Displayed quota = quota_basic + quota_extra.
- **coupons**: `id` (PK, ULID), `user_id` (NULL until redeemed), `price`, `quota_extra`, `created_at`, `redeemed_at`. One redemption per coupon.
- **webhooks**: internal `id` (INTEGER, FK target for events), `user_id` (FK), `ulid` (unique public id — wire **`id`** and trigger URL `/w/:ulid`), `name` (wire **`label`**), `description`, `policy` (JSON string: `email_schedule`, `retention_days`), **`position`** (user-defined home order), `created_at`.
- **webhook_events**: `id`, `webhook_id`, `user_id` (denormalized), `title`, `body`, `read_at`, `created_at`.
- **fcm_tokens**: `user_id`, `fcm_token`; PK (`user_id`, `fcm_token`).

Schema: see `config/schema.sql`.

---

## 4. Tech stack

- **Bun for everything**: runtime, backend, frontend tooling, and scripts. No Node, npm, pnpm, or Vite.
- **Backend**: **Bun** + **TypeScript**. HTTP server (Bun.serve), SQLite via `bun:sqlite`, install/run with `bun install` / `bun run`.
- **Frontend**: Served and bundled by **Bun** (e.g. Bun.serve with HTML/TSX imports, or Bun build); **React** + **TypeScript**; PWA with service worker; **mobile-first**, vertical (portrait) cellphone viewport as primary.
- **UI**: Custom CSS; mobile-first, no Tailwind/shadcn in current build.
- **Backend responsibilities**:
  - Legendum OAuth login/callback and signed session cookies.
  - Webhooks: Pues resource at `/api/webhooks` (list, create, update, delete, filter, reorder); events remain on `/webhooks/:ulid/events*` and `/alerts`.
  - Public endpoint: `GET/POST /w/:ulid` → lookup by ulid; consume quota (basic then extra, else Legendum charge if linked), create webhook_event, send FCM; **429** when exhausted.
  - **Quota weekly job**: every **7 days** after a user’s last reset, reset `quota_basic` to 100 (run `scripts/reset-quota-weekly.ts` via cron).
  - **Housekeeping job** (future): delete webhook_events older than policy.retention_days when policies are implemented.
  - Register FCM tokens for authenticated users.
- **Push**: Firebase Cloud Messaging (FCM) — free, works with PWAs. Backend calls FCM HTTP API when a webhook is triggered.
- **DB**: **SQLite** at `data/alerting.db` (see `config/pues.yaml` `db.path`).
- **Domain**: **alerting.app** (configurable via `config/alerting.yaml`).
- **Config**: **config/alerting.yaml** (see `config/alerting.example.yaml`; gitignored). Holds app and FCM/Firebase settings; see [FCM.md](./FCM.md).
- **CORS**: Open to `*` for API and public webhook endpoint.
- **Admin scripts**: `scripts/create-coupon.ts [quota_extra]` creates a coupon; `scripts/reset-quota-weekly.ts` resets quota_basic every 7 days (run via cron).

---

## 5. API reference

Base URL: configured `domain` in `config/alerting.yaml` (e.g. `https://alerting.app`). Same-origin dev: `http://localhost:3000`.

**Auth:** Authenticated routes require the **`alert_session`** HttpOnly cookie (set by `/auth/callback`). The value is a signed `user_id`, not a reusable API bearer token.

**CORS:** `*` on API routes. **Content-Type:** `application/json` unless noted.

**Errors:** `{ "error": "<code>", "message": "..." }` — e.g. `unauthorized`, `not_found`, `quota_exceeded`, `invalid_request`.

### 5.1 Auth

| Method | Path | Description |
|--------|------|-------------|
| GET | `/auth/login` | Redirect to Legendum OAuth (CSRF `state` cookie). |
| GET | `/auth/callback` | Exchange code, upsert user, set `alert_session`, redirect `/`. New users get a default webhook. |
| POST | `/auth/logout` | Clear session cookie. **200** `{ "ok": true }`. |

### 5.2 Webhooks (Pues resource)

CRUD is **`/api/webhooks`** via Pues `mountResource` (see `config/pues.yaml` and `../pues/docs/SPEC.md` §5–6 for reorder, filters, and wire rules).

Legacy **`/webhooks`** list/create routes are removed. **Trigger URLs stay** `GET|POST /w/:ulid` where `:ulid` is wire `id`.

**Wire row** (list/create/update responses):

```json
{
  "id": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  "label": "Production errors",
  "position": 1000,
  "description": "Optional",
  "policy": "{\"email_schedule\":\"never\",\"retention_days\":7}",
  "created_at": 1708012800
}
```

| Method | Path | Body / notes |
|--------|------|----------------|
| GET | `/api/webhooks` | JSON **array** of rows, ordered by `position`. Filter: `?name=…` (contains on name/description). |
| POST | `/api/webhooks` | `{ "label": "…", "description?", "policy?" }` — **201**. Default policy `never` / 7 days. |
| GET | `/api/webhooks/:id` | Single row. |
| PATCH | `/api/webhooks/:id` | `{ "label?", "description?", "policy?" }` or reorder `{ "before": "<id>" }` / `{ "after": "<id>" }` / `{ "position": N }`. |
| DELETE | `/api/webhooks/:id` | **204**. Cascades events. |

Trigger URL for clients: `{origin}/w/{row.id}`.

Optional header on mutations: `X-Op-Id` (for future SSE echo suppression).

### 5.3 Alerts and events

Event routes use **`/webhooks/:ulid/events*`** (`:ulid` = public webhook id).

**`GET /alerts`** — all events for user (last 7 days), newest first. Query: `limit` (default 50, max 100), `before_id` (cursor).

First page includes `total_unread` and `unread_by_webhook` (map of webhook id → count). Later pages return `0` / `{}` for those fields.

```json
{
  "events": [{ "id": 1, "webhook_ulid": "…", "webhook_name": "…", "title": "…", "body": "…", "read_at": null, "created_at": 1708012800 }],
  "total_unread": 3,
  "unread_by_webhook": { "01ARZ…": 2 },
  "has_more": true
}
```

| Method | Path | Description |
|--------|------|-------------|
| PUT | `/alerts/seen` | Body `{ "event_ids": [1,2,3] }` — bulk mark read. |
| GET | `/webhooks/:ulid/events` | Per-webhook events; same cursor params. |
| PUT | `/webhooks/:ulid/events/seen` | Bulk mark read for that webhook. |
| PATCH | `/webhooks/:ulid/events/:event_id` | Body `{ "read": true\|false }`. |
| DELETE | `/webhooks/:ulid/events/:event_id` | **204**. |

### 5.4 Settings and push

**`GET /settings/me`** — `email`, `timezone`, `quota_basic`, `quota_extra`, `quota_reset`, `mail_hour`, `legendum_linked`, `meta` (e.g. `{ "theme": "dark" }`).

**`PATCH /settings/me`** — `{ "timezone"? , "meta"? }` — returns updated profile fields.

| Method | Path | Body |
|--------|------|------|
| POST | `/settings/redeem-coupon` | `{ "coupon_id": "<ulid>" }` → `{ "quota_basic", "quota_extra" }` |
| POST | `/settings/piped-setup` | `{ "webhook_url", "piped_api_key" }` → `{ "ok": true }` |
| POST | `/push/register` | `{ "fcmToken": "…" }` — up to 20 devices per user. |

Legendum account linking uses **`/settings/legendum/*`** (widget on `/quota`).

### 5.5 Public endpoints

**`GET /api/firebase-config`** — Firebase web config + `vapidPublicKey` for the PWA (**503** if unset).

**`GET|POST /w/:ulid`** — trigger webhook (no auth).

Title/body (later overrides earlier):

1. Query: `?title=…&body=…`
2. Form POST: `application/x-www-form-urlencoded`
3. JSON: `{ "title", "body" }`

Defaults: title `"You have an alert"`. Max title 256 chars, body 1024.

**Quota:** consume `quota_basic`, then `quota_extra`; if both zero, try Legendum charge when linked; else **429**. Weekly reset refills `quota_basic` to 100.

**Side effects:** insert `webhook_event`, FCM push to registered devices; email if `policy.email_schedule` is `each` or digest when `daily`.

| Status | Meaning |
|--------|---------|
| 202 | Accepted — `{ "ok": true, "title", "body" }` |
| 404 | Unknown ULID |
| 429 | No quota (and Legendum charge failed or unavailable) |

**Example:**

```bash
curl -X POST "https://alerting.app/w/01ARZ3NDEKTSV4RRFFQ69G5FAV" \
  -H "Content-Type: application/json" \
  -d '{"title":"Deploy failed","body":"staging"}'
```

---

## 6. Security / privacy

- **Auth cookie**: `alert_session` carries a signed `user_id` (HMAC + expiry). HttpOnly; `Secure` on HTTPS deployments.
- Webhook URLs are **secret by obscurity** (unguessable ULIDs). Optional: later add “secret” query param or header so only callers who know the secret can trigger.
- Rate limit webhook trigger endpoint **per webhook ULID** to avoid abuse.
- Prefer HTTPS only.

---

## 7. Out of scope for v1

- **Paying tier / billing** (longer retention and daily/weekly email summaries are gated for paying users; policy JSON already supports them).
- Teams or multiple users per webhook.
- Auth on the webhook URL (beyond optional secret).
- Native mobile apps (PWA only first).

---

## 8. Future developments

- **Native mobile apps**: We will deliver an **Android** and **iOS** version of the app in the respective app stores (Google Play, Apple App Store).
- **Payment**: Users will be able to **buy a coupon** (additional quota) on the /quota page; the coupon will be emailed so they can redeem it in the app. Currently “Buy a coupon” shows prices with “Coming soon”.

---

## 9. App UX

**Look and feel:** Optimized for a **vertical screen**, **cellphone-sized** (narrow viewport, thumb-friendly). Primary use is as a **PWA** (add to home screen, app-like). Design for portrait-first; desktop/tablet is secondary.

**Layout — top section:** **Left** = Inbox logo with unread badge. **Middle** = **Quota** (basic + extra). **Right** = Settings. **Below** = webhook list ordered by user **`position`** (drag to reorder). **Screens:** Webhooks home → per-webhook events; global **Inbox**; **Settings**.

### 9.1 Webhooks list (main)

- **Top bar:** Left = Inbox logo + unread count; middle = Quota (single number); right = Settings.
- **Body:** Webhooks in **position** order (DnD). Each row: **label**, optional description, **unread badge**.
- **"+"** (`AddButton`) creates a webhook; dialog shows trigger URL to copy.
- **Swipe left:** **Config** and **Delete** (Pues row primitives).
- **Tap** a webhook → navigate to that webhook’s **events list**.

### 9.2 Webhook events list (per webhook)

- **Email-summary style** list of events for this webhook (title, body, time; read/unread state).
- **Back arrow** (or equivalent) returns to the **webhooks list**.
- Tapping an event can mark it read and/or expand details as needed.

### 9.3 Inbox

- **Inbox** shows **recent events across all webhooks** (unified feed). On the webhooks list, the Inbox entry has a **red circle badge** with the **total unread event count** (same metaphor as per-webhook badges).
- **Tap** an event (or “Open inbox”) → a **custom version of the email-summary style page** that includes, for each event, the **name of the webhook** it belongs to (so the user can tell which webhook fired).
- Same back navigation to return to the main webhooks list (or to the webhook-specific events list depending on flow).

### 9.4 Navigation summary

- **Webhooks list** = home; top bar has Inbox, Quota, Settings; below, webhooks in position order (DnD), “+” to add, swipe Config/Delete, tap for events.
- **Webhook events** = list for one webhook; back to webhooks list.
- **Inbox** = all recent events with webhook name; back to webhooks list.

**API for dashboard:** `useResource("webhooks")` → `GET /api/webhooks` (order from `position`). `GET /alerts` supplies `total_unread` and `unread_by_webhook` for badges (first page only).

### 9.5 Settings

- **Settings** (top right) opens a page with **timezone**, **log out**, and link to **Quota** (/quota). **Quota page**: redeem coupon (form by coupon ID) and “Buy a coupon” options (prices shown; purchase coming soon).
- **Log out** clears the session cookie; user sees Legendum login again.
- **Theme** via `PATCH /settings/me` `meta.theme` (`ThemeChooser` on home).

---

## Checklist (implementation)

Use this to track progress when building the app.

- [x] **DB**: `data/alerting.db` from `config/schema.sql` (users, webhooks, webhook_events, fcm_tokens, coupons).
- [x] **Auth**: Legendum OAuth (`/auth/login`, `/auth/callback`, `/auth/logout`) + `alert_session` cookie.
- [x] **Webhooks API**: Pues `/api/webhooks` (wire `id`/`label`/`position`; filter, reorder, ownership).
- [x] **Events API**: `GET /alerts`, `/webhooks/:ulid/events*`, seen/read/delete.
- [x] **Push**: `POST /push/register`; FCM on trigger; service worker + client registration.
- [x] **Trigger**: `GET|POST /w/:ulid` — quota, Legendum fallback, event + FCM + email policy.
- [x] **Quotas & jobs**: Weekly reset script; coupons → `quota_extra`; retention housekeeping script.
- [x] **Settings**: `GET/PATCH /settings/me` (timezone, meta.theme, quotas); redeem coupon; piped setup.
- [x] **Frontend**: `useResource("webhooks")`, DnD order, `AddButton`, swipe Config/Delete; Inbox; Settings; `/quota`.
- [ ] **Pues cutover (ongoing)**: auth/billing/SSE/PWA/top bar per `docs/standardize-plan.md`.

---

## Summary

**Auth**: Legendum OAuth → signed session cookie.  
**Core**: Public `/w/:ulid` triggers → event + FCM (+ email per policy).  
**CRUD**: `/api/webhooks` (Pues wire rows); events on `/alerts` and `/webhooks/:ulid/events*`.  
**Goal**: Minimal PWA; no passwords.
