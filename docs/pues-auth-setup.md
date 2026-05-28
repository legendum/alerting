# Pues auth setup (Alerting)

Alerting uses Pues hosted auth when `LEGENDUM_API_KEY` is set. Routes:

| Path | Purpose |
|------|---------|
| `GET /pues/auth/login` | Start Legendum OAuth |
| `GET /pues/auth/callback` | OAuth callback (sets `pues_session` cookie) |
| `POST /pues/auth/logout` | Clear session |
| `GET/PATCH /pues/me` | Theme `meta` only |
| `/pues/legendum/*` | Link account, status, billing token |

Alerting-specific profile (email, timezone, quota) stays on **`GET/PATCH /settings/me`**.

## Environment

```bash
LEGENDUM_API_KEY=...
LEGENDUM_SECRET=...
LEGENDUM_BASE_URL=https://legendum.co.uk   # or your Legendum host

PUES_DOMAIN=https://alerting.app           # public origin (OAuth redirect base)
PUES_COOKIE_SECRET=...                     # session HMAC; required in hosted mode

# Optional: reuse from config/alerting.yaml if unset (server sets at boot)
# cookie_secret in alerting.yaml → PUES_COOKIE_SECRET
```

Hosted mode is on when **`LEGENDUM_API_KEY`** is set (`isByLegendum()`).

## Legendum app configuration (action required)

Update your Legendum OAuth app to use the **new callback URL**:

| | Old | New |
|---|-----|-----|
| Redirect URI | `{domain}/auth/callback` | **`{PUES_DOMAIN}/pues/auth/callback`** |

Example production:

```text
https://alerting.app/pues/auth/callback
```

Example local dev (`PUES_DOMAIN=http://localhost:3000`):

```text
http://localhost:3000/pues/auth/callback
```

The login entry point for users is **`/pues/auth/login`** (not `/auth/login`).

`/quota` page Legendum widget now mounts at **`/pues/legendum`** (not `/settings/legendum`).

## Session cookie

- **Name:** `pues_session` (replaces `alert_session`)
- Existing sessions will not carry over — users sign in once after deploy.

## Self-hosted (no `LEGENDUM_API_KEY`)

Pues auth OAuth routes are not mounted. Use local/dev flows documented in `../pues/docs/SPEC.md` §3 (self-hosted session bootstrap) when you add that to the SPA shell.
