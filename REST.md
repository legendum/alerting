# Alert — REST API

Base URL: `https://alerting.app` (or relative for same-origin).

**Auth:** Authenticated endpoints accept either:
- **Cookie** (set by `GET/POST /auth/verify`; the user's API token is **encrypted** into the cookie; we do not store the plain token, only its hash)
- **Header:** `Authorization: Bearer <token>` (the user's API token; only the user has the plain value)

**CORS:** `*` for all endpoints.

**Content-Type:** `application/json` for request/response bodies unless noted.

---

## Auth

### Request login link

```http
POST /auth/request-link
```

**Body:**

```json
{
  "email": "user@example.com"
}
```

If the email already exists, the token_hash is rotated (old hash replaced everywhere) and the token status is reset to `pending`. A new login link is sent. If the email is new, a default webhook ("My default webhook") is created automatically.

**Responses:**

| Status | Description |
|--------|-------------|
| 200    | Email sent (new token created as pending, or link resent with rotated token if email already exists). |
| 400    | Invalid email. |
| 503    | Email sending failed (server-side error). In non-production, the response includes `login_link` and `token` for debugging. |

**Response body (200):**

```json
{
  "ok": true
}
```

In non-production mode, the response also includes `login_link` and `token` for debugging.

---

### Verify token (log in)

```http
GET  /auth/verify?token=<plain_token>
POST /auth/verify
```

**POST body (if POST):**

```json
{
  "token": "<plain_token>"
}
```

**Responses:**

| Status | Description |
|--------|-------------|
| 200    | Token valid; token activated if pending. **Sets encrypted session cookie** and returns bearer token in body. |
| 302    | (GET only, non-JSON Accept) Redirects to app root with session cookie set. |
| 400    | Missing or invalid token. |
| 404    | Token not found or inactive. |

**Response body (200):**

```json
{
  "token": "<plain_token>"
}
```

Client may use this `token` as `Authorization: Bearer <token>` for subsequent requests. The same token is encrypted into a cookie for browser use. We do not store the plain token; only its hash is in the DB.

For GET requests without `Accept: application/json`, the server responds with a 302 redirect to the app root instead of returning JSON.

---

### Confirm change email

```http
GET /auth/confirm-email?token=<confirmation_token>
```

**Auth:** None (the link in the email contains a signed confirmation token).

Called when the user clicks the confirmation link sent to the **new** email address. Backend sets `email = email_new` on the token and clears `email_new`. Old email is no longer associated with the token.

**Responses:**

| Status | Description |
|--------|-------------|
| 302    | Email updated; redirect to `/?email_confirmed=1`. |
| 302    | Invalid or expired confirmation token; redirect to `/?email_confirm=invalid`. |

---

### Log out

```http
POST /auth/logout
```

**Auth:** Cookie (or bearer; typically called with cookie so the server can unset it).

Server **unsets the session cookie** (Set-Cookie with empty value and past expiry). Client should clear any stored bearer token.

**Responses:**

| Status | Description |
|--------|-------------|
| 200    | Logged out; cookie cleared. |

**Response body (200):**

```json
{
  "ok": true
}
```

---

## Webhooks

### List webhooks

```http
GET /webhooks
```

**Auth:** Required.

Returns webhook **names, descriptions**, and metadata (ulid, url, policy, created_at). Ordered by `created_at` descending. **No unread or event counts** — the app gets counts from `GET /alerts`. The **client** figures out webhook order (by recency of events) from the events list.

**Responses:**

| Status | Description |
|--------|-------------|
| 200    | Success. |
| 401    | Not authenticated. |

**Response body (200):**

```json
{
  "webhooks": [
    {
      "ulid": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      "name": "Production errors",
      "description": "Backend error alerts",
      "policy": { "email_schedule": "never", "retention_days": 7 },
      "url": "https://alerting.app/w/01ARZ3NDEKTSV4RRFFQ69G5FAV",
      "created_at": 1708012800
    }
  ]
}
```

---

### Create webhook

```http
POST /webhooks
```

**Auth:** Required.

**Body:**

```json
{
  "name": "Production errors",
  "description": "Optional description",
  "policy": { "email_schedule": "never", "retention_days": 7 }
}
```

- **name** (string, required)
- **description** (string, optional)
- **policy** (object, optional) — default `{ "email_schedule": "never", "retention_days": 7 }`

**Responses:**

| Status | Description |
|--------|-------------|
| 201    | Created. |
| 400    | Validation error (e.g. missing name). |
| 401    | Not authenticated. |

**Response body (201):**

```json
{
  "ulid": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  "name": "Production errors",
  "description": "Optional description",
  "policy": { "email_schedule": "never", "retention_days": 7 },
  "url": "https://alerting.app/w/01ARZ3NDEKTSV4RRFFQ69G5FAV",
  "created_at": 1708012800
}
```

---

### Get webhook

```http
GET /webhooks/:ulid
```

**Auth:** Required.

**Responses:**

| Status | Description |
|--------|-------------|
| 200    | Success. |
| 401    | Not authenticated. |
| 404    | Webhook not found or not owned by this token. |

**Response body (200):** Same shape as single webhook object above (ulid, name, description, policy, url, created_at).

---

### Update webhook

```http
PATCH /webhooks/:ulid
```

**Auth:** Required.

**Body (all fields optional):**

```json
{
  "name": "New name",
  "description": "New description",
  "policy": { "email_schedule": "never", "retention_days": 14 },
  "regenerate_ulid": true
}
```

- **regenerate_ulid:** if `true`, assign a new ULID to this webhook; old URL stops working. Response returns new `ulid` and `url`.

**Responses:**

| Status | Description |
|--------|-------------|
| 200    | Updated. |
| 400    | Validation error. |
| 401    | Not authenticated. |
| 404    | Webhook not found or not owned by this token. |

**Response body (200):** Full webhook object (with new `ulid` and `url` if `regenerate_ulid` was true).

---

### Delete webhook

```http
DELETE /webhooks/:ulid
```

**Auth:** Required.

Deletes the webhook and cascades to delete all its events.

**Responses:**

| Status | Description |
|--------|-------------|
| 204    | Deleted (no body). |
| 401    | Not authenticated. |
| 404    | Webhook not found or not owned by this token. |

---

## Alerts

### List all recent alerts (Inbox)

```http
GET /alerts
```

**Auth:** Required.

**Query parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | int | 50 | Page size (max 100). |
| `before_id` | int | — | Cursor: return events with `id < before_id` (for infinite scroll). |

Returns **all read and unread events** across all webhooks for the current user, newest first, scoped to the **last 7 days**. Each event includes `webhook_ulid` and `webhook_name`.

On the **first page** (no `before_id`), the response includes `total_unread` and `unread_by_webhook` counts. On subsequent pages these are `0` / `{}` (the client should use the values from the first page).

**Responses:**

| Status | Description |
|--------|-------------|
| 200    | Success. |
| 401    | Not authenticated. |

**Response body (200):**

```json
{
  "events": [
    {
      "id": 1,
      "webhook_ulid": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      "webhook_name": "Production errors",
      "title": "Error in payment service",
      "body": "Connection timeout",
      "read_at": null,
      "created_at": 1708012800
    }
  ],
  "total_unread": 3,
  "unread_by_webhook": {
    "01ARZ3NDEKTSV4RRFFQ69G5FAV": 2,
    "01ARZ3NDEKTSV4RRFFQ69G5FAV2": 1
  },
  "has_more": true
}
```

- **total_unread**: count of events where `read_at` is null (first page only).
- **unread_by_webhook**: map of webhook ULID → unread count (first page only).
- **has_more**: `true` if more events exist beyond this page.

---

### Mark alerts as seen (bulk read)

```http
PUT /alerts/seen
```

**Auth:** Required.

Marks the given alert IDs as read (sets `read_at` to now) for the current user.

**Body:**

```json
{
  "event_ids": [1, 2, 3]
}
```

- **event_ids** (array of int, required) — IDs of events to mark as read. Invalid/missing IDs are silently ignored.

**Responses:**

| Status | Description |
|--------|-------------|
| 200    | Done. |
| 400    | Invalid JSON. |
| 401    | Not authenticated. |

**Response body (200):**

```json
{
  "ok": true
}
```

---

### List events (for one webhook)

```http
GET /webhooks/:ulid/events
```

**Auth:** Required.

**Query parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | int | 50 | Page size (max 100). |
| `before_id` | int | — | Cursor: return events with `id < before_id` (for infinite scroll). |

Events are retained 7 days; server scopes to that window.

**Responses:**

| Status | Description |
|--------|-------------|
| 200    | Success. |
| 401    | Not authenticated. |
| 404    | Webhook not found or not owned by this token. |

**Response body (200):**

```json
{
  "events": [
    {
      "id": 1,
      "webhook_ulid": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      "title": "Error in payment service",
      "body": "Connection timeout",
      "read_at": null,
      "created_at": 1708012800
    },
    {
      "id": 2,
      "webhook_ulid": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      "title": "You have an alert",
      "body": null,
      "read_at": 1708012900,
      "created_at": 1708012850
    }
  ],
  "has_more": false
}
```

- `read_at` null = unread; set = read (Unix timestamp).
- `has_more`: `true` if more events exist beyond this page.

---

### Mark webhook events as seen (bulk read)

```http
PUT /webhooks/:ulid/events/seen
```

**Auth:** Required.

Marks the given event IDs as read for the specified webhook.

**Body:**

```json
{
  "event_ids": [1, 2, 3]
}
```

**Responses:**

| Status | Description |
|--------|-------------|
| 200    | Done. |
| 400    | Invalid JSON. |
| 401    | Not authenticated. |
| 404    | Webhook not found or not owned by this token. |

**Response body (200):**

```json
{
  "ok": true
}
```

---

### Mark event read/unread

```http
PATCH /webhooks/:ulid/events/:event_id
```

**Auth:** Required.

**Body:**

```json
{
  "read": true
}
```

- **read** (boolean): `true` = mark read (set `read_at` to now), `false` = mark unread (clear `read_at`).

**Responses:**

| Status | Description |
|--------|-------------|
| 200    | Updated. |
| 400    | Invalid body. |
| 401    | Not authenticated. |
| 404    | Webhook or event not found, or not owned by this token. |

**Response body (200):** Updated event object (id, webhook_ulid, title, body, read_at, created_at).

---

### Delete event

```http
DELETE /webhooks/:ulid/events/:event_id
```

**Auth:** Required.

**Responses:**

| Status | Description |
|--------|-------------|
| 204    | Deleted (no body). |
| 400    | Invalid event ID. |
| 401    | Not authenticated. |
| 404    | Webhook or event not found, or not owned by this token. |

---

## Settings (account)

### Get current account

```http
GET /settings/me
```

**Auth:** Required.

Returns current email (and optionally `email_new` if a change is pending), **timezone**, **quota_basic**, **quota_extra**, **quota_reset**, and **mail_hour**.

**Response body (200):**

```json
{
  "email": "user@example.com",
  "email_new": "newaddress@example.com",
  "timezone": "America/New_York",
  "quota_basic": 100,
  "quota_extra": 0,
  "quota_reset": 1708012800,
  "mail_hour": 8
}
```

- `email_new` omitted if no change pending.
- `timezone` is IANA timezone (e.g. `America/New_York`), or `null` if not set.
- `quota_basic` resets to 100 every 7 days (from `quota_reset`); `quota_extra` is topped up by redeeming coupons. One quota is consumed per webhook event (basic first, then extra).
- `quota_reset` is the Unix timestamp of the last quota reset.
- `mail_hour` is the server-configured hour (0–23) for daily digest emails.

---

### Update settings (e.g. timezone)

```http
PATCH /settings/me
```

**Auth:** Required.

**Body (all optional):**

```json
{
  "timezone": "America/New_York"
}
```

Updates the token's timezone (or other settings). Returns updated profile.

**Responses:** 200 updated; 400 invalid; 401 not authenticated.

**Response body (200):**

```json
{
  "email": "user@example.com",
  "timezone": "America/New_York",
  "quota_basic": 100,
  "quota_extra": 0
}
```

---

### Request change email

```http
POST /settings/change-email
```

**Auth:** Required.

**Body:**

```json
{
  "email_new": "newaddress@example.com"
}
```

Stores `email_new` on the token and sends a **confirmation link** to `email_new`. The current `email` remains in use until the user clicks that link. When they do, backend runs the confirm flow (see `GET /auth/confirm-email`): set `email = email_new`, clear `email_new`.

**Responses:**

| Status | Description |
|--------|-------------|
| 200    | Confirmation email sent to the new address. |
| 400    | Invalid email, same as current, or already in use by another account. |
| 401    | Not authenticated. |

**Response body (200):**

```json
{
  "ok": true,
  "email_new": "newaddress@example.com"
}
```

---

### Redeem coupon

```http
POST /settings/redeem-coupon
```

**Auth:** Required.

**Body:**

```json
{
  "coupon_id": "01ARZ3NDEKTSV4RRFFQ69G5FAV"
}
```

Adds the coupon's `quota_extra` amount to the token's **quota_extra**. Each coupon can only be redeemed **once** (single-use, not per-token).

**Responses:**

| Status | Description |
|--------|-------------|
| 200    | Coupon redeemed; returns updated quotas. |
| 400    | Invalid coupon_id or already redeemed. |
| 401    | Not authenticated. |
| 404    | Coupon not found. |

**Response body (200):**

```json
{
  "quota_basic": 100,
  "quota_extra": 50
}
```

---

### Setup Piped alias

```http
POST /settings/piped-setup
```

**Auth:** Required.

Configures an `alert` shell alias on [piped.sh](https://piped.sh) that curls the user's webhook URL with title and body arguments.

**Body:**

```json
{
  "webhook_url": "https://alerting.app/w/01ARZ3NDEKTSV4RRFFQ69G5FAV",
  "piped_api_key": "<piped_api_key>"
}
```

- **webhook_url** (string, required) — the full webhook trigger URL.
- **piped_api_key** (string, required) — the user's piped.sh API key.

**Responses:**

| Status | Description |
|--------|-------------|
| 200    | Alias configured. |
| 400    | Missing webhook_url or piped_api_key. |
| 401    | Not authenticated. |
| 500    | Failed to connect to piped.sh. |

**Response body (200):**

```json
{
  "ok": true
}
```

---

## Push

### Register FCM token

```http
POST /push/register
```

**Auth:** Required.

Registers a device for push notifications. Supports up to 20 devices per user (oldest are pruned). Same `fcmToken` is upserted (re-registering the same device is idempotent).

**Body:**

```json
{
  "fcmToken": "<fcm_device_token>"
}
```

**Responses:**

| Status | Description |
|--------|-------------|
| 200    | Registered. |
| 400    | Missing or invalid fcmToken. |
| 401    | Not authenticated. |

**Response body (200):**

```json
{
  "ok": true
}
```

---

## Public endpoints (no auth)

### Firebase config

```http
GET /api/firebase-config
```

Returns the Firebase web app configuration for the PWA client to initialize Firebase Messaging.

**Responses:**

| Status | Description |
|--------|-------------|
| 200    | Firebase config returned. |
| 503    | Firebase is not configured on this server. |

**Response body (200):**

```json
{
  "apiKey": "...",
  "authDomain": "...",
  "projectId": "...",
  "storageBucket": "...",
  "messagingSenderId": "...",
  "appId": "...",
  "vapidPublicKey": "..."
}
```

---

### Trigger webhook

```http
GET  /w/:ulid
POST /w/:ulid
```

**Auth:** None. Anyone with the URL can trigger.

**Title and body** can be provided via any of these methods (later sources override earlier):

1. **Query parameters:** `?title=Custom+title&body=Custom+message`
2. **Form body** (POST with `Content-Type: application/x-www-form-urlencoded`): `title=...&body=...`
3. **JSON body** (POST with `Content-Type: application/json`):

```json
{
  "title": "Custom title",
  "body": "Custom message or payload snippet"
}
```

If no title is provided, defaults to "You have an alert". Title is truncated to 256 chars, body to 1024 chars.

**Quota:** When the webhook fires, the backend consumes one quota (decrements **quota_basic** if > 0, else **quota_extra**). If total quota is 0, return 429 quota exceeded. **quota_basic** resets to 100 **every 7 days** (from last reset); **quota_extra** is increased only by redeeming coupons.

**Email notification:** If the webhook's policy has `email_schedule: "each"`, an alert email is sent to the user immediately. If `email_schedule: "daily"`, the event is included in the next daily digest.

**Push notification:** FCM push is sent to all registered devices for the user.

**Responses:**

| Status | Description |
|--------|-------------|
| 202    | Accepted. Quota decremented, webhook event created, FCM push sent. |
| 404    | Webhook not found (invalid or deleted ULID). |
| 429    | Quota exceeded (no quota left). |

**Response body (202):**

```json
{
  "ok": true,
  "title": "Custom title",
  "body": "Custom message or payload snippet"
}
```

---

## Errors

For 4xx/5xx, JSON body:

```json
{
  "error": "not_found",
  "message": "Webhook not found"
}
```

Suggested **error** codes: `invalid_request`, `unauthorized`, `not_found`, `rate_limited`, `quota_exceeded`, `email_failed`, `piped_error`, `connection_error`, `not_configured`, `server_error`, `internal_error`.
