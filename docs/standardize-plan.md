# Alerting UI Standardization Plan

This plan implements `docs/standardize.md`: make Alerting look and behave like
the sister Pues apps while keeping the existing alert/webhook functionality.
Use `../todos`, `../fifos`, and `../pues` as the reference implementations.

## Goals

- Replace Alerting's custom top bar with the Pues top bar pattern used by
  Todos and Fifos.
- Move settings behind the top-left app logo and remove the cog button.
- Add a synthetic first home row, **All Alerts**, to take over the current
  inbox/logo behavior.
- Standardize home rows on Pues row primitives while keeping Alerting's red
  unread-count pills.
- Replace created-at/activity sorting with explicit draggable ordering.
- Put filters in the top bar for webhooks and in the detail header for alerts.
- Keep the current webhook configuration behavior, but render it in a Pues
  `Dialog` and label the swipe action **Edit**.
- Keep quota visible, but move it to settings so the top bar has room for
  filter + Legendum.
- Make Pues resource routes the primary app-internal API. Preserve only the
  public `/w/:ulid` trigger contract.
- Adopt Pues PWA build/serve/registration while preserving Alerting's Firebase
  push-notification behavior.

## Current Status

Last updated: **2026-05-28**

Overall progress: **~55% complete** (Phases 1–3 done; Phases 4–11 remain).

### Progress Checklist

- [x] **Phase 1:** Vendor required Pues parts (`core`, `auth`, `billing`,
      `objects`, `sse`, `pwa`) and DnD dependencies.
- [x] **Phase 2:** Add `webhooks.position` to schema + migration
      (`config/migrations/001_add_webhooks_position.sql`) + migration tests.
- [x] **Phase 3:** Mount `/api/webhooks` with `mountResource`; add resource CRUD
      test coverage (list/create/update/delete/filter/reorder/ownership).
- [x] **Phase 3 end state:** Cut UI over to `useResource("webhooks")` (default
      `/api` base path), DnD/reorder, `AddButton` create flow, and remove legacy
      internal `/webhooks` CRUD handlers.
- [ ] **Phase 4:** Pues auth + billing cutover.
- [ ] **Phase 5:** Pues SSE + PWA cutover.
- [ ] **Phase 6:** Shared app shell alignment.
- [ ] **Phase 7:** Pues top bar + settings dialog.
- [ ] **Phase 8:** Home list row migration + drag/swap + **All Alerts** row.
- [ ] **Phase 9:** Detail alerts filter.
- [ ] **Phase 10:** CSS cleanup after component cutovers.
- [ ] **Phase 11:** Final verification sweep.

### Phase 3 — Delivered

**Server**

- `src/api/webhookResource.ts` mounts `/api/webhooks` via `mountResource` with
  `beforeInsert`/`beforeUpdate` policy normalization.
- `src/api/server.ts` uses Bun `routes` map composition (Todos/Fifos style).
- Legacy internal `/webhooks` CRUD removed (`src/api/handlers/webhooks.ts`
  deleted).
- Public trigger boundary unchanged at `/w/:ulid` (route-level regression test
  in `test/handlers.test.ts`).

**Client**

- `App.tsx` loads webhooks with `useResource<WebhookEntry>("webhooks")`.
- `WebhooksList.tsx` uses `useDndPositions`, `useDelete`, `AddButton`,
  `DragHandle`, Pues swipe rows (`.row-*`), and a post-create URL dialog.
- Alert unread counts remain a separate side-channel (`GET /alerts`).

**Tests / types**

- `/api/webhooks` resource tests cover wire shape, filter, reorder, ownership.
- `types/pues/base/objects/index.d.ts` updated so `UseResourceResult` includes
  `newOpId`, `reload`, and `mutate` (typecheck clean).

### Still on Legacy Patterns (expected — later phases)

| Area | Current | Target phase |
|------|---------|--------------|
| Auth routes | Local `/auth/*`, `/settings/me`, custom `Login.tsx` | Phase 4 |
| Billing | Quota in trigger handler only; no Pues billing | Phase 4 |
| Live updates | No SSE broadcast on webhook mutations | Phase 5 |
| PWA | Custom build; no Workbox/Pues SW | Phase 5 |
| Top bar | Custom `TopBar.tsx` with cog + quota | Phase 7 |
| Home filter | None | Phase 7–8 |
| **All Alerts** row | Inbox via top-bar logo tap | Phase 8 |
| Swipe label | **Config** (not **Edit**) | Phase 8 |
| Config panel | Custom overlay + manual PATCH | Phase 8 (Pues `Dialog`) |
| Event routes | `/webhooks/:ulid/events*` (internal, fine for now) | — |
| Detail filter | None | Phase 9 |
| CSS | Both `.topbar*` and new `.row-*` coexist | Phase 10 |

### Completed Highlights

- [x] `/api/webhooks` resource route mounted with `beforeInsert`/`beforeUpdate`
      normalization.
- [x] Public trigger compatibility boundary preserved at `/w/:ulid`.
- [x] Baseline rename/config updates landed (`config/alerting.yaml`,
      `data/alerting.db`, `Alerting.app`, default `3000`).
- [x] Server now respects `PORT` from env with `3000` fallback.
- [x] Webhook home list: draggable ordering persisted via `position` column.

### Next Milestone — Phase 4 (Auth + Billing)

- [ ] `configureAuth` at server startup; mount `/pues/auth/*`, `/pues/legendum/*`,
      `/pues/me`.
- [ ] Replace custom `Login.tsx` with Pues `LoginScreen`; use `useUser` on client.
- [ ] Retire local `/auth/login`, `/auth/callback`, `/auth/logout`, and
      `/settings/legendum/*` once sessions migrate.
- [ ] Add Alerting billing names to `config/pues.yaml`; quota-first gating in
      trigger handler before Pues billing.
- [ ] Auth + billing tests (login callback, `/pues/me`, quota-first trigger,
      coupon isolation from billing).

## Phase 1: Vendor the Needed Pues Parts

Alerting currently vendors `theme`, `style`, and `db`. To match Todos/Fifos,
extend `config/pues.yaml` and re-run `bun run pues`:

```yaml
pues:
  - core
  - theme
  - style
  - db
  - auth
  - billing
  - objects
  - sse
  - pwa

core:
  name: alerting

pwa:
  icon192: /img/red-ball-192.png
  icon512: /img/red-ball-512.png

objects:
  resources:
    webhooks:
      table: webhooks
      filter:
        contains: [name, description]
```

Add `objects` because the plan depends on:

- `TopBar`, `LogoButton`, and `FilterBar` from `pues/base/objects`.
- `Dialog`, `DragHandle`, `useSwipeToReveal`, `useFilter`, and
  `useDndPositions` from `pues/base/objects`.
- `ulid` from `pues/base/core`, replacing `src/lib/ulid.ts` eventually.
- `LoginScreen`, `useUser`, route mounting, and `Legendum` from
  `pues/base/auth`.
- `chargeNamed` or tab primitives from `pues/base/billing/server`, gated by
  Alerting quota checks.
- `sseRoute` from `pues/base/sse`, so `useResource("webhooks")` stays live.
- `buildPwa`, `mountPwaRoutes`, and `registerServiceWorker` from
  `pues/base/pwa`.

Add the DnD runtime dependencies used by Todos/Fifos:

```json
"@dnd-kit/core": "...",
"@dnd-kit/sortable": "...",
"@dnd-kit/utilities": "..."
```

Use the package manager to add the latest versions rather than pinning by hand.

`objects.resources.webhooks` is the destination shape, not just an optional
future cleanup. Internal app routes may change to become Pues-compatible. The
compatibility boundary is the public webhook trigger route: existing webhook
URLs must continue to work.

## Phase 2: Database Position Migration

Add `position` to `webhooks` so the home list is user-ordered rather than
activity-sorted.

Update `config/schema.sql`:

```sql
position INTEGER NOT NULL DEFAULT 0
```

Create a new `config/migrations/*.sql` migration that:

1. Adds `webhooks.position`.
2. Backfills each user's existing webhooks in a stable order.
3. Uses sparse values compatible with Pues position math, for example
   `1000, 2000, 3000`.

Recommended backfill order: preserve the current home-page feel for existing
users by ordering each user's webhooks by most recent alert, then `created_at`
descending as a tie-breaker. After the migration, stop sorting dynamically.

Tests to add in this phase:

- Migration test for an existing DB without `webhooks.position`.
- Backfill ordering test across at least two users.
- Idempotency test that the migration does not rewrite already-migrated rows.
- Fresh schema test that `config/schema.sql` creates `position` correctly.

Move webhook CRUD to `mountResource` as part of this work:

- Mount the Pues resource on its conventional API path, for example
  `/api/webhooks`.
- Update the web UI to consume the Pues wire shape instead of preserving the
  current `/webhooks` response format.
- Let `mountResource` own listing, creating, updating, deleting, filtering, and
  reordering.
- `ulid` becomes wire `id`.
- `name` becomes wire `label`.
- `position`, `created_at`, and optional Pues roles stay canonical.
- `description` and `policy` pass through as app-owned columns.
- The trigger URL should be derived client-side from `row.id`.

Keep only the public trigger contract stable:

- Existing URLs shaped like `/w/:ulid` must continue to accept alerts.
- Trigger handlers should continue resolving `:ulid` against `webhooks.ulid`.
- Changes to internal CRUD routes are acceptable as long as trigger URLs do not
  break.

## Phase 3: Pues Resource Cutover

Be aggressive here: after the `position` migration exists, switch webhook CRUD
to Pues rather than maintaining a long-lived compatibility API.

Server work:

- Add `objects.resources.webhooks` to `config/pues.yaml` and fail startup if it
  is missing.
- Mount the resource with `mountResource({ name: "webhooks", db: getDb,
  config, resolveUser })`.
- Use `/api/webhooks` as the app-internal CRUD path.
- Legacy `src/api/handlers/webhooks.ts` removed after UI cutover (done).
- Keep `/w/:ulid` public trigger handling unchanged except for any internal
  query updates needed after schema changes.
- If webhook creation needs default `policy`, use a `beforeInsert` hook rather
  than a bespoke POST handler.
- If webhook config needs policy validation/normalization, use a
  `beforeUpdate` hook.

Client work:

- Replace hand-written `/webhooks` fetches with `useResource("webhooks", {
  basePath: "/api" })`.
- Consume Pues wire rows directly: `row.id`, `row.label`, `row.position`,
  `row.description`, `row.policy`, `row.created_at`.
- Derive trigger URLs from `row.id`, for example `${origin}/w/${row.id}`.
- Use `AddButton` or the same Pues-compatible POST body shape for creation.
- Use `useRename`, `useDelete`, and `useDndPositions` where they fit.
- Keep app-specific alert counts as a separate side-channel keyed by webhook
  `id`.

Route cleanup:

- It is okay to break or remove old app-internal `/webhooks` CRUD routes.
- Do not break `/w/:ulid`.
- Do not keep duplicate CRUD APIs unless a short temporary bridge is needed
  during one commit; duplicate paths should not be the planned end state.

Tests to add in this phase:

- API tests for `GET`, `POST`, `PATCH`, `DELETE`, filter, and reorder on
  `/api/webhooks`.
- Ownership tests proving one user cannot read, update, reorder, or delete
  another user's webhook.
- Wire-shape tests for `id`, `label`, `position`, `description`, `policy`, and
  `created_at`.
- Regression test that existing `/w/:ulid` trigger URLs still create alerts.
- Test that alert counts remain keyed correctly after moving CRUD to Pues wire
  rows.

## Phase 4: Pues Auth and Billing Cutover

Adopt Pues `auth` and `billing` as part of the destination architecture, not as
optional UI polish.

Auth work:

- Configure Pues auth once at server startup.
- Mount `/pues/auth/*`, `/pues/legendum/*`, and `/pues/me`.
- Move the client from `/settings/me` fetches to Pues `useUser` where possible.
- Keep Alerting-specific user fields available either through the Pues user
  response extension path or a narrow Alerting settings endpoint.
- Replace the local logged-out screen with `LoginScreen`.
- Use `<Legendum>` in the Pues top-bar right slot.
- Retire local `/auth/login`, `/auth/callback`, `/auth/logout`, and
  `/settings/legendum/*` once existing sessions and callback behavior are
  handled by Pues auth.

Billing work:

- Add Alerting billing names to `config/pues.yaml` under `billing.charges` or
  `billing.tabs`.
- Never hardcode charge amounts in handlers.
- Gate billing through Alerting quota: consume/free-check quota first, and only
  call Pues billing when quota policy says a charge should happen.
- Keep coupons outside Pues billing. Coupons remain quota grants/redemptions
  that add to `quota_extra`.
- Handle billing failures explicitly: insufficient funds should become a 402
  where the user/action can see it; token-invalid should clear the stored token
  and prompt relinking.
- Close any billing tabs on process shutdown if tab billing is used.

Likely quota/billing flow for alert triggers:

1. Resolve the webhook and owner from `/w/:ulid`.
2. Apply the existing quota policy (`quota_basic`, then `quota_extra`).
3. If quota allows the write without billing, create the alert and stop.
4. If quota policy requires billing, charge via Pues billing.
5. Only create the alert after the required quota/billing gate succeeds.

Coupons stay in the quota lane:

- `coupons` table and redemption endpoints remain Alerting-owned.
- Coupon redemption updates `quota_extra`.
- Coupon logic should not call Pues billing and should not be represented as a
  billing charge.

Tests to add in this phase:

- Auth route tests for login callback, logout, `/pues/me`, and unauthorized
  behavior.
- User storage tests that existing users, timezone, meta/theme, quota fields,
  and Legendum tokens survive the auth cutover.
- Billing tests for quota-first behavior: basic quota, extra quota, then
  billing only when the policy requires it.
- Coupon redemption tests proving coupons update `quota_extra` without calling
  billing.
- Billing failure tests for insufficient funds and token-invalid clearing.

## Phase 5: Pues SSE and PWA Cutover

Adopt Pues `sse` and `pwa` as first-class parts of the destination.

SSE work:

- Call `sseRoute({ resolveUser })` exactly once at server startup.
- Spread the SSE route map into the app routes.
- Pass `puesSse.broadcast` into `mountResource("webhooks")`.
- For alert/event mutations that remain custom, bridge any resource-relevant
  changes through the same broadcast channel when the webhooks resource needs
  to update.
- Keep Alerting's existing push/polling path for notification delivery; SSE is
  for live app state, not a replacement for FCM push.

PWA work:

- Vendor the Pues `pwa` part.
- Add a PWA build step that calls `buildPwa` with Alerting's service-worker
  hooks injected:

  ```ts
  await buildPwa({
    root: process.cwd(),
    additionalAssets: [
      { url: "/main.css", path: "src/web/main.css" },
      { url: "/img/inbox-192.png", path: "src/web/img/inbox-192.png" },
      { url: "/img/inbox-512.png", path: "src/web/img/inbox-512.png" },
    ],
    serviceWorker: {
      importScripts: ["/dist/alerting-sw-hooks.js"],
    },
  });
  ```

- Replace the hand-served `src/web/manifest.json` route with `mountPwaRoutes`
  where possible.
- Wire `mountPwaRoutes().fetch` as a static fall-through so Workbox chunks are
  served correctly.
- Call `registerServiceWorker()` from the web entry point.
- Replace the current root-scoped `/alert-sw.js` registration with the single
  Pues-generated root service worker at `/dist/sw.js`.
- Move Alerting-specific service-worker behavior into the imported hooks script
  served at `/dist/alerting-sw-hooks.js`:
  - Firebase compat `importScripts`.
  - Firebase initialization with server-rendered config.
  - `messaging.onBackgroundMessage`.
  - `notificationclick`.
  - queued offline action/background sync behavior, if it is still needed.
- Serve `/dist/alerting-sw-hooks.js` dynamically with the Firebase config
  embedded, using `Cache-Control: no-store, max-age=0`.
- Update push registration to use the existing Pues SW registration:

  ```ts
  registerServiceWorker();
  const registration = await navigator.serviceWorker.ready;
  await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
  ```

- Keep explicit icon URLs in `config/pues.yaml` pointing at the existing red
  ball assets unless/until the app icon convention changes.

Tests to add in this phase:

- Server tests that `/manifest.json`, `/dist/sw.js`, icon URLs, and Workbox
  chunks are served by Pues PWA routes.
- Build test or smoke assertion that `buildPwa` emits the manifest and service
  worker assets.
- Test or static assertion that generated `/dist/sw.js` imports
  `/dist/alerting-sw-hooks.js`.
- Server test that `/dist/alerting-sw-hooks.js` contains the Firebase config and
  is served with no-store cache headers.
- Client test or smoke check that `registerServiceWorker()` is called once.
- Push registration test that Firebase `getToken` receives
  `navigator.serviceWorker.ready` rather than registering `/alert-sw.js`.
- Regression tests for Firebase config and push registration endpoints.
- Regression test that FCM notification delivery still works after the Pues PWA
  route cutover.
- SSE tests for authenticated stream access and resource broadcasts on webhook
  create/update/delete/reorder.

## Phase 6: Shared App Shell

Refactor `src/web/App.tsx` toward the Todos/Fifos shape:

- Hold one `filterQuery` for the home webhook list.
- Add a separate `detailFilterQuery` or resettable per-detail query for alerts.
- Wrap the render tree in `<Pues user={loading ? undefined : user}>`.
- Keep loading and logged-out states simple.

Tests to add in this phase:

- Component or integration tests for loading, logged-out, and logged-in render
  branches.
- Test that the Pues user context reaches the top-bar Legendum widget.
- Test that unauthorized responses clear the client user state.

## Phase 7: Top Bar and Settings Dialog

Replace `src/web/components/TopBar.tsx` with the shared pattern:

- Use `TopBar as PuesTopBar` from `pues/base/objects`.
- Set `logoSrc` to Alerting's primary icon.
- Set `logoTitle` / `logoAriaLabel` to "Settings".
- Use `onLogoClick` or `renderInstallDialog` to open settings.
- Pass the home `filterQuery`, setter, input ref, placeholder, and aria label.
- Render the Legendum login/link widget in the right slot.
- Remove the cog button and quota badge from the top bar.

The logo should inherit Pues `LogoButton` behavior: smaller visual size,
periodic wiggle until first click, and hover wiggle thereafter.

Convert `Settings` from a full screen into a Pues `Dialog`:

- Keep email, timezone, theme, logout, and Piped alias setup.
- Move quota display here: `quota_basic + quota_extra`, reset information if
  useful, and any low-quota styling.
- Keep nested Piped setup either as a second `Dialog` or as a section inside
  settings.
- Remove settings from the `Screen` union once it is purely dialog state.

Tests to add in this phase:

- Top-bar test that the logo opens settings and the cog button is absent.
- Settings dialog tests for timezone update, theme update, quota display,
  logout, and close behavior.
- Piped setup dialog tests for success and error messaging.

## Phase 8: Home List Rows

Refactor `WebhooksList` to match the row structure used by `../fifos`, backed
by the Pues `webhooks` resource:

- Add `DragHandle` at the left for real draggable mode.
- Use `useDndPositions` against `/api/webhooks`.
- Use `useFilter` for home filter matching.
- While filtered, render static rows with disabled drag handles.
- Keep red unread-count pills on each webhook row.
- Use `useSwipeToReveal({ actionCount: 2 })`.
- Rename the left swipe action from **Config** to **Edit**.
- Open the existing webhook config form inside a Pues `Dialog`.
- Keep **Delete** as the destructive swipe action.

Add the synthetic **All Alerts** row at the top of the home list:

- It is not persisted and not draggable.
- It shows the total unread red pill.
- Selecting it opens the existing inbox/all-alerts view.
- It should stay visible above filtered persisted webhooks unless the filter
  clearly excludes "All Alerts".

Remove the old top-left inbox button behavior after **All Alerts** is in place.

Tests to add in this phase:

- Home list tests for synthetic **All Alerts** row placement, unread count, and
  selection behavior.
- Filter tests for webhook `label`, `description`, and id matching.
- Reorder tests for drag result payloads and persisted ordering after reload.
- Swipe tests for **Edit** and **Delete** actions.
- Dialog test that **Edit** preserves existing webhook config behavior.

## Phase 9: Detail Alerts Filter

Update `WebhookEvents` so the top of the detail page has a filter for alerts:

- Keep the filter visually at the top of the page, below the global top bar.
- Filter alert rows by title, body, and timestamp text.
- Do not use the home webhook filter for detail alerts unless the UX explicitly
  wants the query to carry between home and detail.
- Keep paging and polling behavior intact.
- When a filter is active, filter the loaded rows only; do not change server
  pagination semantics in the first pass.

Apply the same treatment to `Inbox` if **All Alerts** should also have a filter.
If only webhook detail pages need filtering, leave `Inbox` unchanged except for
how it is reached from the synthetic row.

Tests to add in this phase:

- Detail filter tests for title, body, timestamp, and no-match states.
- Regression tests for pagination while a filter is active.
- Regression tests for mark-read and delete behavior under an active filter.

## Phase 10: CSS Cleanup

After adopting Pues components, remove local CSS that duplicates Pues defaults:

- `.topbar*`
- `.icon-btn`
- custom dialog overlay/panel classes that become `pues-dialog-*`
- old webhook row config naming after the action becomes `row-edit`

Keep Alerting-specific CSS for:

- red unread pills and unread dots;
- alert row body/link styling;
- webhook URL/help sections;
- any quota styling in settings;
- app-specific spacing that is not covered by Pues defaults.

Avoid broad formatting churn in `src/web/main.css`; delete or rename only the
rules touched by this work.

## Phase 11: Verification

Run the canonical checks:

```sh
bun run lint
bun run test
bun run tsc
bun run smoke
```

Manual checks:

- Logged-out screen still reaches Login with Legendum.
- Pues auth routes own login, logout, Legendum link/status, and `/pues/me`.
- Alert trigger quota gating still uses `quota_basic` then `quota_extra`.
- Coupons still redeem into `quota_extra` and do not call Pues billing.
- Pues billing is called only after quota policy says a charge is required.
- Billing insufficient-funds and token-invalid paths are handled.
- Pues SSE keeps webhook resource state live after create/update/delete/reorder.
- Pues PWA routes serve the manifest, generated service worker, icons, and
  Workbox chunks.
- Firebase push registration and notification delivery still work after the
  Pues PWA cutover.
- Top-left logo opens settings, wiggles until first click, and has no cog peer.
- Settings can update timezone, theme, logout, and Piped alias setup.
- Quota is visible in settings and no longer consumes top-bar space.
- Top-bar filter filters webhooks.
- **All Alerts** opens the all-alerts view and shows total unread count.
- Webhook rows drag to reorder and persist after reload.
- Webhook CRUD uses `/api/webhooks` Pues resource routes.
- Existing `/w/:ulid` webhook trigger URLs still create alerts.
- Filtered webhook rows are not draggable.
- Swipe left shows **Edit** and **Delete**.
- **Edit** opens the same config behavior inside a Pues `Dialog`.
- Detail alert filter filters loaded alerts without breaking pagination.
- Existing databases migrate without losing webhooks or alerts.

## Open Questions

- Should **All Alerts** be included in home filter results, or always pinned?
- Should the detail alert filter apply to `Inbox` as well as per-webhook detail?
- What should the canonical app name be for `core.name`: `alert`, `alerting`,
  or the deployed hostname?
- Which trigger actions require Pues billing after quota is exhausted: every
  alert write, only premium delivery modes, or another policy?
