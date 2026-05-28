# DB Migration To Pues - provisional spec

This spec covers moving alerting's database bootstrap from local
`src/lib/db.ts` initialization to Pues `base/db`, with
`config/schema.sql` as the canonical schema and `config/migrations/` for
future schema changes.

## Goal

Adopt Pues database bootstrapping so schema evolution lands through
explicit SQL migrations instead of being mixed into app startup logic and
hardcoded script DB paths.

## Current State

Alerting currently owns SQLite setup in `src/lib/db.ts`:

- opens `db_path` from `config/alerting.yaml` (default
  `data/alerting.db`);
- enables WAL and foreign keys;
- applies `schema.sql` from repo root;
- has no migration runner or migration tracking table;
- keeps several operational scripts on hardcoded `data/alerting.db`
  connections (`scripts/create-coupon.ts`, `scripts/delete-old-events.ts`,
  `scripts/reset-quota-weekly.ts`).

Notes:

- `scripts/send-daily-digest.ts` already uses app `getDb()`.
- tests in `test/handlers.test.ts` build an in-memory DB from root
  `schema.sql` and mock `src/lib/db.js`.

## Target State

Use Pues `base/db` as the single DB bootstrap path:

- add `db` to vendored Pues parts;
- configure the DB path through `config/pues.yaml` `db.path`;
- move schema source to `config/schema.sql` (from root `schema.sql`);
- add `config/migrations/` for ordered SQL migrations;
- replace local `getDb()` internals with a thin wrapper/re-export around
  `pues/base/db/server`;
- make operational scripts resolve the same DB path/bootstrap path as app
  code.

Pues DB provides boot mechanics. Alerting continues to own its tables and
schema.

## Pues DB Behavior (current implementation)

On first `getDb()` call, Pues `base/db`:

1. reads `config/pues.yaml` `db.path` (defaults to `data/<core-name>.db`
   if unset);
2. honors `PUES_DB_PATH` env var as an override;
3. opens SQLite with directory creation;
4. enables WAL + foreign keys;
5. applies `config/schema.sql` (required);
6. applies pending `config/migrations/*.sql` files in lexicographic order;
7. records applied files in a `migrations` table.

## Config

Add `db` to `config/pues.yaml`:

```yaml
pues:
  - theme
  - style
  - db
```

Set DB path in `config/pues.yaml`:

```yaml
db:
  path: data/alerting.db
```

Open compatibility decision for alerting:

- Current app config uses `config/alerting.yaml` `db_path` and related env
  override flows (`ALERT_DB_PATH` via `applyEnvOverrides`).
- Pues DB uses `db.path` + optional `PUES_DB_PATH`.

Recommendation: Phase 1 wrapper maps legacy config/env to Pues override
before first DB open (or migrate callers to `PUES_DB_PATH` and deprecate
`db_path` explicitly).

## `config/schema.sql`

Create `config/schema.sql` from current root `schema.sql` with no semantic
changes.

Rules:

- additive and idempotent (`CREATE TABLE IF NOT EXISTS`,
  `CREATE INDEX IF NOT EXISTS`);
- keep alerting-specific tables in this repo;
- keep it as the human-readable full schema source for fresh DBs.

During transition, either:

1. keep root `schema.sql` as a temporary mirror for tests/scripts still
   reading it, or
2. switch tests/scripts immediately to `config/schema.sql`.

## Migrations

Create `config/migrations/` for all future schema changes.

File naming:

```text
001_<change>.sql
002_<change>.sql
003_<change>.sql
```

Rules:

- append-only;
- never edit already-applied files;
- use explicit `ALTER TABLE`/backfill SQL for existing DBs;
- keep large data changes resumable where possible.

## Alerting-Specific Script Requirements

Scripts currently bypass app DB bootstrap and hardcode DB file paths.
Migration should align them:

- `scripts/create-coupon.ts`:
  - stop creating `coupons` table inline (schema source should be
    `config/schema.sql`);
  - resolve DB through shared bootstrap/path config.
- `scripts/delete-old-events.ts` and `scripts/reset-quota-weekly.ts`:
  - stop hardcoded `data/alerting.db`;
  - use shared path/bootstrap mechanism.
- `scripts/send-daily-digest.ts` already uses `getDb()`; verify behavior
  stays consistent after wrapper swap.

## Two-Phase Adoption

### Phase 1: Compatibility wrapper

Keep `src/lib/db.ts` as import path to avoid broad churn.

In this phase:

- `src/lib/db.ts` delegates to Pues `getDb()`;
- optionally bridges legacy `db_path`/`ALERT_DB_PATH` to `PUES_DB_PATH`;
- exports `resetDbForTesting()` by delegating to Pues
  `resetDbForTesting()`;
- app code/tests keep importing `src/lib/db.ts`.

### Phase 2: Direct Pues imports

After Phase 1 stabilizes:

```ts
import { getDb } from "pues/base/db/server";
```

Then delete/shrink `src/lib/db.ts` to only app-specific helpers (if any).

## Phase 1 Wrapper Shape

```ts
export { getDb } from "pues/base/db/server";
export { resetDbForTesting } from "pues/base/db/server";
```

If legacy compatibility is needed, the wrapper sets `PUES_DB_PATH` before
first DB open.

## Rollout Plan

### Phase 1: boot path migration

1. Add `db` to `config/pues.yaml` and re-vendor (`bun run pues`).
2. Add `db.path` to `config/pues.yaml`.
3. Move schema to `config/schema.sql` (from root `schema.sql`).
4. Replace `src/lib/db.ts` internals with Pues DB wrapper.
5. Add `config/migrations/` (empty initially is fine).
6. Align scripts to shared DB bootstrap/path.
7. Verify fresh DB creation and existing DB startup.

### Phase 2: cleanup

1. Switch DB imports to `pues/base/db/server` where appropriate.
2. Remove/reduce `src/lib/db.ts`.
3. Land future schema changes through `config/migrations/`.

## Verification

Required checks:

- fresh DB starts with all current alerting tables/indexes;
- existing DB starts with no data loss;
- `migrations` tracking table exists and behaves correctly;
- pending migration files apply exactly once;
- cron/admin scripts target the same DB path as app runtime;
- tests remain isolated and deterministic.

## Risks

- schema drift if `config/schema.sql` does not exactly match current live
  schema;
- path drift if legacy `db_path` and Pues `db.path` are both present and
  disagree;
- script behavior drift if scripts continue bypassing shared bootstrap;
- test breakage during root `schema.sql` to `config/schema.sql` transition.

## Decision

Adopt Pues DB for alerting bootstrap + migration support while keeping
alerting's schema app-owned, with `config/schema.sql` as canonical schema
and `config/migrations/` for future changes.
