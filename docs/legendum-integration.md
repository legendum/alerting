# Alert + Legendum integration

## Login with Legendum

### Flow

```
User clicks "Login with Legendum"
  → Redirect to Legendum /auth/authorize
  → User authenticates
  → Redirect back to {domain}/auth/callback?code=...&state=...
  → Server exchanges code via POST /api/auth/token (exchangeCode)
  → Response includes verified email, linked flag, and optionally legendum_token when linked
  → Find or create user by email; persist legendum_token when returned
  → Set session cookie, redirect to app
```

Identity is **verified email** from Legendum only. Alert does **not** store Legendum `account_id`.

### Implementation

- **`GET /auth/login`** — `legendum.authUrl()`, CSRF cookie `alert_oauth_state`
- **`GET /auth/callback`** — `legendum.exchangeCode()`, lookup `users` by **email**, insert if new (default webhook), update `users.email` on repeat login, set **`users.legendum_token`** when the exchange returns a service token (`legendum_token` / `account_token` / `token`)

### Pay with Legendum

- SDK **`legendum.middleware()`** at `/settings/legendum/*` — stores **`users.legendum_token`** when the user completes linking in the widget
- **`trigger.ts`** — charges via `legendum.charge(legendum_token, ...)` when quota is exhausted

### Config

- Register `https://<your-domain>/auth/callback` (or equivalent) as a callback URL in Legendum service settings (`BASE_URL` / `domain` in Alert config)

## Future ideas

- API keys / MCP (mentioned in older notes) would use the same session + `legendum_token` model; no `account_id` column.
