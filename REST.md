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

**Responses:**

| Status | Description |
|--------|-------------|
| 200    | Email sent (new token created as pending, or link resent if email already exists). |
| 400    | Invalid email. |

**Response body (200):** Optional `{ "ok": true }` or empty.

---

### Verify token (log in)

```http
GET  /auth/verify?token=<token_hash>
POST /auth/verify
```

**POST body (if POST):**

```json
{
  "token": "<token_hash>"
}
```

**Responses:**

| Status | Description |
|--------|-------------|
| 200    | Token valid; token activated if pending. **Sets encrypted session cookie** and returns bearer token in body. |
| 400    | Missing or invalid token. |
| 404    | Token not found or inactive. |

**Response body (200):**

```json
{
  "token": "<bearer_token>"
}
```

Client may use this `token` as `Authorization: Bearer <token>` for subsequent requests. The same token is encrypted into a cookie for browser use. We do not store the plain token; only its hash is in the DB.

---

### Confirm change email

```http
GET /auth/confirm-email?token=<confirmation_token>
```

**Auth:** None (the link in the email contains a one-time or signed confirmation token).

Called when the user clicks the confirmation link sent to the **new** email address. Backend sets `email = email_new` on the token and clears `email_new`. Old email is no longer associated with the token.

**Responses:**

| Status | Description |
|--------|-------------|
| 200    | Email updated; redirect to app or show success. |
| 400    | Invalid or expired confirmation token. |
| 404    | Token not found. |

---

## Webhooks

### List webhooks

```http
GET /webhooks
```

**Auth:** Required.

**Query (optional):** `?limit=50&offset=0` for pagination (if needed).

Returns webhook **names, descriptions**, and metadata (ulid, url, policy, created_at). **No unread or event counts** — the app gets counts from `GET /events`. The **client** figures out webhook order (by recency of events) from the events list (e.g. latest `created_at` per webhook).

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
      "policy": { "email": "never", "retention_days": 7 },
      "url": "https://alerting.app/w/01ARZ3NDEKTSV4RRFFQ69G5FAV",
      "created_at": 1708012800
    }
  ]
}
```

No `unread_count` or similar in the webhook objects.

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
  "policy": { "email": "never", "retention_days": 7 }
}
```

- **name** (string, required)
- **description** (string, optional)
- **policy** (object, optional) — default `{ "email": "never", "retention_days": 7 }`

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
  "policy": { "email": "never", "retention_days": 7 },
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
  "policy": { "email": "never", "retention_days": 14 },
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

**Responses:**

| Status | Description |
|--------|-------------|
| 204    | Deleted (no body). |
| 401    | Not authenticated. |
| 404    | Webhook not found or not owned by this token. |

---

## Webhook events

### List all recent events (Inbox)

```http
GET /events
```
**Alternate:** `GET /inbox`

**Auth:** Required.

**Query (optional):** `?limit=50&offset=0`, `?read=false` (only unread), `?read=true` (only read). Server typically scopes to **last 7 days** for the token (events retention).

Returns **all read and unread events** across all webhooks for the current user (by token_hash), newest first. The server **counts** `read_at` (null = unread) and includes **total_unread** and **unread_by_webhook** in the response so the app can show the Inbox badge and per-webhook badges with **one call** — no separate count endpoints. Each event includes webhook_ulid and webhook_name. Default window: last 7 days.

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
  }
}
```

**total_unread**: count of events where `read_at` is null. **unread_by_webhook**: map of webhook ULID → unread count (server-computed from the same events).

---

### List events (for one webhook)

```http
GET /webhooks/:ulid/events
```

**Auth:** Required.

**Query (optional):** `?limit=50&offset=0`, `?read=false` (only unread), `?read=true` (only read). Events are retained 7 days; server scopes to that window.

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
  ]
}
```

`read_at` null = unread; set = read (Unix timestamp). This is sufficient to derive per-webhook and total unread counts (count events where `read_at` is null).

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

## Settings (account)

### Log out

```http
POST /auth/logout
```

**Auth:** Cookie (or bearer; typically called with cookie so the server can unset it).

Server **unsets the session cookie** (e.g. Set-Cookie with empty value and past expiry). Client should clear any stored bearer token. After logout, user must log in again (request link → verify).

**Responses:**

| Status | Description |
|--------|-------------|
| 200    | Logged out; cookie cleared. |

**Response body:** Optional `{ "ok": true }` or empty.

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
| 400    | Invalid email or same as current. |
| 401    | Not authenticated. |

**Response body (200):** Optional `{ "ok": true }` or empty.

---

### Get current account (optional)

```http
GET /settings/me
```

**Auth:** Required.

Returns current email (and optionally `email_new` if a change is pending), **timezone**, and **quota_basic**, **quota_extra** so the UI can show them. The **main page** displays these quotas (e.g. "Basic: 85 · Extra: 12").

**Response body (200):**

```json
{
  "email": "user@example.com",
  "email_new": "newaddress@example.com",
  "timezone": "America/New_York",
  "quota_basic": 100,
  "quota_extra": 0
}
```

`email_new` omitted or null if no change pending. **timezone** is optional (e.g. IANA `America/New_York`); used for **daily quota reset at midnight** in that timezone, email summaries, and displaying times. **quota_basic** is reset to 100 at midnight in the token’s timezone; **quota_extra** gets **+10** at the same time (so everyone can try custom policy), plus any amount from redeeming coupons. Tokens with no timezone use a fallback (e.g. UTC).

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

Updates the token’s timezone (or other settings). Returns updated profile.

**Responses:** 200 updated; 400 invalid; 401 not authenticated.

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

Adds the coupon’s `quota_basic` and `quota_extra` to the token’s quotas. Each coupon can be redeemed **once per token** (same coupon by another user = separate redemption).

**Responses:**

| Status | Description |
|--------|-------------|
| 200    | Coupon redeemed; returns updated quotas. |
| 400    | Invalid coupon_id or already redeemed by this token. |
| 401    | Not authenticated. |
| 404    | Coupon not found. |

**Response body (200):**

```json
{
  "quota_basic": 200,
  "quota_extra": 50
}
```

---

## Push

### Register FCM token

```http
POST /push/register
```

**Auth:** Required.

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

**Response body (200):** Optional `{ "ok": true }` or empty.

---

## Public: trigger webhook (no auth)

```http
GET  /w/:ulid
POST /w/:ulid
```

**Auth:** None. Anyone with the URL can trigger.

**POST body (optional):**

```json
{
  "title": "Custom title",
  "body": "Custom message or payload snippet"
}
```

If omitted or empty, backend uses default title/body (e.g. "You have an alert").

**Quota:** When the webhook fires, the backend decrements the token’s **quota_basic** (if the webhook has the **basic default policy**: e.g. retention_days 7 and email "never") or **quota_extra** (if the webhook has a **custom policy**: longer retention or email single/daily/weekly). If the relevant quota is 0, return 429 quota exceeded. **quota_basic** is reset to 100 at **midnight in the token’s timezone** each day; **quota_extra** gets +10 at the same time (plus any amount from redeeming coupons).

**Responses:**

| Status | Description |
|--------|-------------|
| 202    | Accepted. Quota decremented, webhook event created, FCM push sent (or queued). |
| 404    | Webhook not found (invalid or deleted ULID). |
| 429    | Rate limited (per webhook ULID) or **quota exceeded** (no quota_basic or quota_extra for this webhook’s policy). |

**Response body (202):** Optional `{ "ok": true }` or empty. No need to return event id.

---

## Errors

For 4xx/5xx, optional JSON body:

```json
{
  "error": "not_found",
  "message": "Webhook not found"
}
```

Suggested **error** codes: `invalid_request`, `unauthorized`, `not_found`, `rate_limited`, `internal_error`.
