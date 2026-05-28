# Alert — Product Spec

A minimal PWA: **create webhooks → receive alerts as push notifications**. Same auth model as Piped: email-only signup, login token sent by email.

---

## 1. What it does

- **User signs up** with email only.
- **User gets a login link/token by email** — click (or copy token) to log in. No passwords.
- **User creates one or more webhooks** — each webhook is a unique URL. When that URL is called (e.g. `POST /w/abc123`), the app sends a **push notification** to that user.
- **User receives alerts** as push notifications on their device (browser PWA, via FCM).

We store as little as possible: email, tokens, webhooks (by ulid), webhook events (for read/unread list), and FCM tokens for push.

---

## 2. User flows

### 2.1 Auth (same as Piped)

1. **Sign up / Request link**: User enters email → we **create a token** with status **pending** and send an email with a **magic link** (or one-time token + link to app).
2. **Click link** (or open app and paste token) → we **activate** the token (status → **active**) and user is logged in. Token is long-lived so they can use it as “API token” for scripts.
3. Optional: “Request new login link” if they lost it (sends a new link; token stays the same or we rotate).

No passwords, no extra profile fields. Email + token = identity. Pending tokens cannot be used for API access until activated.

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

**Hierarchy:** An email has a token; a token has webhooks; a webhook has events.

- **tokens**: `token_hash` (PK), `email` (UNIQUE), `email_new` (optional), `status` ('pending' | 'active' | 'inactive'), **timezone** (TEXT, optional), **quota_basic** (default 100; reset to 100 **every 7 days** from last reset; consumed first when a webhook fires), **quota_extra** (default 0; topped up by coupon redemption; consumed when quota_basic is 0), **quota_reset** (Unix epoch of last basic reset), `created_at`. Displayed quota = quota_basic + quota_extra.
- **coupons**: `id` (PK, ULID), `token_hash` (NULL until redeemed), `price`, `quota_extra` (amount added to token’s quota_extra on redemption), `created_at`, `redeemed_at`. One redemption per coupon (token_hash and redeemed_at set when redeemed).
- **webhooks**: `id` (PK, INTEGER auto-increment), `token_hash` (FK), `ulid` (unique, for trigger URL `/w/:ulid`), `name`, `description` (optional), `policy` (JSON; **not implemented yet** — reserved for future retention, email summaries, etc.), `created_at`.
- **webhook_events**: `id` (PK, INTEGER), `webhook_id` (FK → webhooks.id), `token_hash` (denormalized), `title`, `body`, `read_at`, `created_at`. Query by token_hash + created_at for inbox and unread counts. (Housekeeping by policy.retention_days not implemented yet.)
- **fcm_tokens** (for push): `token_hash` (FK → tokens), `fcm_token`, `created_at`; primary key (token_hash, fcm_token).

Schema: see `schema.sql`.

---

## 4. Tech stack

- **Bun for everything**: runtime, backend, frontend tooling, and scripts. No Node, npm, pnpm, or Vite.
- **Backend**: **Bun** + **TypeScript**. HTTP server (Bun.serve), SQLite via `bun:sqlite`, install/run with `bun install` / `bun run`.
- **Frontend**: Served and bundled by **Bun** (e.g. Bun.serve with HTML/TSX imports, or Bun build); **React** + **TypeScript**; PWA with service worker; **mobile-first**, vertical (portrait) cellphone viewport as primary.
- **UI**: Custom CSS; mobile-first, no Tailwind/shadcn in current build.
- **Backend responsibilities**:
  - Send login emails (e.g. Resend, SendGrid, or SMTP).
  - Issue and validate login tokens (signed JWT or random token in DB).
  - Webhooks: create, list, get, PATCH (e.g. regenerate ULID), delete; list/mark-read for events.
  - Public endpoint: `GET/POST /w/:ulid` → lookup by ulid; if token has quota (quota_basic + quota_extra &gt; 0), consume one (basic first, then extra), create webhook_event, send FCM push; otherwise 429 quota exceeded.
  - **Quota weekly job**: every **7 days** after a token’s last reset, reset that token’s `quota_basic` to 100 (run `scripts/reset-quota-weekly.ts` via cron).
  - **Housekeeping job** (future): delete webhook_events older than policy.retention_days when policies are implemented.
  - Register FCM tokens for authenticated users.
- **Push**: Firebase Cloud Messaging (FCM) — free, works with PWAs. Backend calls FCM HTTP API when a webhook is triggered.
- **DB**: **SQLite** at `data/alerting.db`. Minimal schema (users/keyed by email, tokens, webhooks, fcm_tokens).
- **Domain**: **alerting.app**.
- **Config**: **config/alerting.yaml** (see config/alerting.example.yaml; alerting.yaml is gitignored). Holds app and FCM/Firebase settings; see FCM.md.
- **CORS**: Open to `*` for API and public webhook endpoint.
- **Admin scripts**: `scripts/create-coupon.ts [quota_extra]` creates a coupon; `scripts/reset-quota-weekly.ts` resets quota_basic every 7 days (run via cron).

---

## 5. API (REST, auth via cookie or bearer token unless noted)

**Auth:** All authenticated endpoints accept **cookie** (browser; the user's API token is **encrypted** into the cookie) or **Authorization: Bearer &lt;token&gt;**. The **bearer token is the user's API token**; we do not store the plain token (only its hash in the DB); only the user has the plain token. Verify response sends both: sets cookie (encrypted token) and returns `{ "token": "..." }` in body so the client can use it as the bearer token.

- `POST /auth/request-link` — body: `{ "email": "..." }` → create token (pending) or resend link if email exists; send magic link email (link contains token_hash; reusable).
- `GET /auth/verify?token=...` or `POST /auth/verify` — body: `{ "token": "..." }` → activate token if pending, log in; **response sets cookie and returns bearer token** in body.
- `GET /webhooks` — list webhooks (auth). Items keyed by `ulid`.
- `POST /webhooks` — create webhook (auth). Body: `name` (required); `description`, `policy` optional. Policy is stored but not implemented yet. Returns webhook object including `ulid` and full trigger URL.
- `GET /webhooks/:ulid` — get one webhook (auth).
- `PATCH /webhooks/:ulid` — update webhook (auth). Used e.g. to **regenerate ULID** (app feature; new ulid, old URL stops working).
- `DELETE /webhooks/:ulid` — delete webhook (auth).
- `GET /webhooks/:ulid/events` — list events for webhook (auth). Supports read/unread in response.
- `PATCH /webhooks/:ulid/events/:event_id` — mark event read/unread (auth). Body e.g. `{ "read": true }` or set `read_at`.
- `POST /push/register` — body: `{ "fcmToken": "..." }` (auth) → store FCM token for user.
- `POST /auth/logout` — (auth) → unset the session cookie; client clears stored token.
- `GET /settings/me` — (auth) → return current email, optional `email_new`, timezone, quota_basic, quota_extra.
- `PATCH /settings/me` — body: `{ "timezone": "..." }` (auth) → update timezone (or other settings).
- `POST /settings/change-email` — body: `{ "email_new": "..." }` (auth) → store email_new, send confirmation link to new address; we set email = email_new only when user clicks the link.
- `GET /auth/confirm-email?token=...` — (no auth) → user clicked link; set email = email_new, clear email_new.
- `POST /settings/redeem-coupon` — body: `{ "coupon_id": "<ulid>" }` (auth) → redeem coupon for this token (add coupon’s quota amount to token’s quota_extra); each coupon can be redeemed once per token. Returns updated quotas or 400 if invalid/already redeemed.
- **Public** (no auth): `GET /w/:ulid` or `POST /w/:ulid` — trigger webhook. Optional body: `{ "title": "...", "body": "..." }` for notification text. Returns **202 Accepted** on success (consumes one quota: basic first, then extra); **404** if webhook not found; **429** if **quota exceeded**. Backend creates webhook_event and sends FCM push. Policy is not implemented (all events use the same quota pool).

---

## 6. Security / privacy

- **Auth cookie**: the user's API token is **encrypted** into the cookie (e.g. AES with a server secret) so the client cannot read or forge it. We do not store the plain API token; only the hash (token_hash) is stored. Only the user has the plain token (from the email and from the verify response).
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

**Layout — top section:** **Left** = main Inbox logo with unread count badge. **Middle** = **Quota** (single number: basic + extra). **Right** = Settings icon. **Below** the top section = list of webhooks (sorted by **recency of events**, so webhooks with the most recent activity appear first). **Main screens:** Webhooks list → (per webhook) Events list; plus global **Inbox**; plus **Settings** (change email).

### 9.1 Webhooks list (main)

- **Top bar:** Left = Inbox logo + unread count; middle = Quota (single number); right = Settings.
- **Body:** List of webhooks, **sorted by recency of events** (most recently active first). Each row shows webhook **name** (and optionally description) and an **unread count** in the standard **red circle badge** (e.g. “3”).
- **"+"** control to create a new webhook (opens create flow; on success, back to this list with the new webhook and its URL to copy).
- **Swipe left** on a webhook row reveals **Delete** (regenerate ULID not in current UI).
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

- **Webhooks list** = home; top bar has Inbox (left, with unread badge), Quota (middle), Settings (right); below, webhooks sorted by event recency, with “+”, and one row per webhook (badge, swipe for delete, tap for events).
- **Webhook events** = list for one webhook; back to webhooks list.
- **Inbox** = all recent events with webhook name; back to webhooks list.

**API for dashboard:** The app makes **two REST calls**: (1) **Get alerts** — one call returns all read and unread alerts (e.g. `GET /alerts`); the server **counts** `read_at` and includes `total_unread` and `unread_by_webhook` so the app can show the Inbox badge and per-webhook badges. (2) **Get webhooks** — one call returns webhook **names and descriptions** (and ulid, url, etc.) **with no counts** (`GET /webhooks`). The app combines the two and **sorts webhooks by recency of events** (client derives order from latest event `created_at` per webhook in the events list).

### 9.5 Settings

- **Settings** (top right) opens a page with **timezone**, **log out**, and link to **Quota** (/quota). **Quota page**: redeem coupon (form by coupon ID) and “Buy a coupon” options (prices shown; purchase coming soon).
- **Log out** clears the session by **unsetting the cookie** (client and server); user is returned to the login (enter email) flow.
- Change-email (optional): user enters `email_new`; we store it and send a confirmation link; we set `email = email_new` only when the user clicks the link. Tokens table has **email_new** (nullable) for this pending state.

---

## Checklist (implementation)

Use this to track progress when building the app.

- [x] **DB**: Create `data/alerting.db` from schema.sql (tokens, webhooks, webhook_events, fcm_tokens, coupons); load config from config/alerting.yaml.
- [x] **Auth**: POST /auth/request-link (create token pending, send email via SMTP); GET/POST /auth/verify (activate, set encrypted cookie + return bearer token); POST /auth/logout; GET /auth/confirm-email (change-email confirm stub).
- [x] **Webhooks API**: GET/POST/DELETE /webhooks, GET/PATCH /webhooks/:ulid (create, list, get, update, regenerate ULID, delete); body: name required, description/policy optional.
- [x] **Events API**: GET /alerts (all alerts + total_unread + unread_by_webhook); GET /webhooks/:ulid/events (cursor pagination); PUT /webhooks/:ulid/events/seen; PATCH /webhooks/:ulid/events/:event_id (mark read/unread).
- [ ] **Push**: POST /push/register (store FCM token); on webhook trigger, send FCM push (FCM stub in code); frontend: request permission, get token, register; service worker for push/notificationclick.
- [x] **Trigger**: GET/POST /w/:ulid (lookup by ulid, consume one quota (basic then extra), create webhook_event, send FCM); 202/404/429.
- [x] **Quotas & jobs**: Weekly job (reset quota_basic to 100 every 7 days). Coupons add to quota_extra. Policy / housekeeping not implemented yet.
- [x] **Coupons**: POST /settings/redeem-coupon (add coupon’s quota_extra to token’s quota_extra); script `scripts/create-coupon.ts [quota_extra]`; coupons table has token_hash/redeemed_at for one redemption per coupon.
- [x] **Settings**: GET/PATCH /settings/me (email, email_new, timezone, quota_basic, quota_extra); POST /settings/change-email and confirm-email flow (confirm stub).
- [x] **Frontend — layout**: Top bar (left: Inbox + unread badge; middle: Quota; right: Settings); body: webhooks list sorted by event recency (client sort); "+" to create webhook; swipe left to delete.
- [x] **Frontend — screens**: Login (enter email, then verify via link); Webhooks list; Webhook events list (per webhook); Inbox (all events + webhook name); Settings (timezone, logout); Create webhook flow; static /quota page (redeem coupon, buy options).
- [x] **Frontend — data**: GET /alerts for alerts + counts; GET /webhooks for names/descriptions; GET /settings/me for user and quotas; mobile-first, portrait.
- [ ] **FCM**: Load config from config/alerting.yaml; backend uses service account + VAPID to send; frontend uses Firebase config + VAPID public to subscribe (see FCM.md when ready).

---

## Summary

**Auth**: Email → login link with token_hash (reusable); verify returns cookie + bearer token.  
**Core**: Webhook URL per user (`/w/:ulid`) → on request, create webhook_event and send push via FCM.  
**Storage**: Email, tokens, webhooks (id = integer, ulid = public), webhook_events (read/unread), FCM tokens.  
**API**: REST keyed by webhook ULID; CORS open to `*`.  
**Goal**: As simple as possible; no passwords.
