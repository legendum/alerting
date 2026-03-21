# Alert + Legendum Integration Spec

Alert currently uses its own auth (magic links + SHA256-hashed tokens + AES-encrypted cookies) and a hybrid quota system (weekly basic + coupon extra + Legendum charges). This spec proposes adding Login with Legendum alongside the existing auth, and consolidating payments through Legendum.

## 1. Login with Legendum

### What changes

Add a "Login with Legendum" button to the login page as an alternative to the existing magic link flow. Users who already have a Legendum account can log in with one click instead of waiting for an email.

### Flow

```
User clicks "Login with Legendum"
  → Redirect to legendum.co.uk/auth/authorize
  → User authenticates (or is already logged in)
  → Redirect back to alerting.app/auth/legendum/callback?code=...&state=...
  → Server exchanges code for { email, account_id, linked }
  → Find or create alert account by email
  → Set session cookie, redirect to inbox
```

### Implementation

**New route: `GET /auth/legendum/callback`**

```typescript
// In auth handler
const { email, accountId, linked } = await legendum.exchangeCode(code, callbackUri);

// Find or create account by email
let token = db.query("SELECT * FROM tokens WHERE email = ?").get(email);
if (!token) {
  // Generate new token, hash it, insert
  const plainToken = generateToken();
  const tokenHash = sha256(plainToken);
  db.run("INSERT INTO tokens (token_hash, email, status) VALUES (?, ?, 'active')", tokenHash, email);
  token = { token_hash: tokenHash, email, status: 'active' };
}

// Store legendum_id for future reference
db.run("UPDATE tokens SET legendum_id = ? WHERE token_hash = ?", accountId, token.token_hash);

// If already linked for payments, great. If not, the linked flag tells us.
if (linked && !token.legendum_token) {
  // They're linked on Legendum's side but we don't have the token
  // They can re-link via the widget if needed
}

// Set session cookie, redirect
```

**New column on `tokens` table:**
- `legendum_id TEXT` — the stable Legendum user ID (e.g. `lgd_123`), separate from `legendum_token` which is for payments

**Login page change:**
- Add button: `<a href="{legendum.authUrl(...)}">Login with Legendum</a>`
- Keep existing magic link as the primary option

**Config:**
- Register `https://alerting.app/auth/legendum/callback` as a callback URL in Legendum's service settings

### What doesn't change

- Existing magic link auth continues to work
- Session management (cookie encryption, bearer tokens) stays the same
- Users can use either login method, both produce the same session

## 2. Pay with Legendum (already partially done)

### Current state

- Legendum SDK middleware handles linking at `/settings/legendum/*`
- `trigger.ts` charges 1 Legendum credit when quota is exhausted
- Link widget is embedded on the `/quota` page

### What to improve

**Auto-link on Login with Legendum:**

When a user logs in via Legendum and the `linked` flag is `true`, we know they've already linked for payments on Legendum's side. But we may not have their `legendum_token` stored locally.

Option: after Login with Legendum, if `linked: true`, prompt to re-link (or auto-link via a new Legendum API endpoint that returns the token for an already-linked account).

For now, keep the link widget as the explicit payment opt-in. Login and payments remain separate consent actions.

**Display Legendum balance on quota page:**

When linked, show the Legendum balance alongside the basic/extra quota. This is already partially done via `/settings/legendum/status`.

**Pricing clarity:**

Each alert trigger costs 1 Legendum credit (1/10th of a penny at the £10/1200 pack). Make this visible on the quota page.

## 3. Future: API keys & MCP

Alert doesn't currently expose a public API or MCP service, but both are natural extensions:

**API keys:**
- Let users generate API keys from settings
- Auth via `Authorization: Bearer <api_key>`
- Same endpoints as the web app uses (webhooks CRUD, events list, trigger)

**MCP service:**
- Expose alert management as MCP tools: `create_webhook`, `list_alerts`, `mark_read`
- Auth via Legendum account ID (Login with Legendum)
- Charge per MCP tool call via Legendum credits

Both would benefit from Login with Legendum as the identity layer — users authenticate once, get an API key or MCP token tied to their Legendum account.

## Summary of changes

| Area | Change | Effort |
|---|---|---|
| Login page | Add "Login with Legendum" button | Small |
| `GET /auth/legendum/callback` | New route: exchange code, find/create account, set session | ~30 lines |
| `tokens` table | Add `legendum_id` column | 1 line |
| Config | Register callback URL with Legendum | Dashboard |
| SDK | Already has `authUrl()` and `exchangeCode()` | Done |
| Payments | Already integrated | Done |
