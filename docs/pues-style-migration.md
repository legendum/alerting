# Migrating alerting onto pues `style`

Goal: stop hand-rolling the app shell + token palette in `src/web/main.css`
and consume the generated **`pues.css`** instead, the way `../todos` and
`../linkobot` already do. End state: `main.css` shrinks to alerting-specific
chrome, and the shared reset / theme tokens / component styles come from
`pues/base/style`.

## Current state (2026-05-27)

- `config/pues.yaml` vendors `theme` and `style`. The `style` source is
  present under `pues/base/style/`, but **nothing builds or loads the
  generated stylesheet** — no `buildStyle` call, no `pues.css` link.
- `src/web/main.css` (658 lines) hand-rolls everything:
  - `:root` + `[data-theme="light"]` token blocks on the **`--bg-*` /
    `--text-*` / `--accent*`** namespace (`main.css:1-55`).
  - The app-shell reset (`* { box-sizing }`, `body`, `#root`) at
    `main.css:57-72`.
  - All component chrome (topbar, dialogs, lists, buttons) as bespoke rules.
- `index.html` links `/pues/theme.css` (served from
  `pues/base/theme/theme.css`) + `/main.css`. The `ThemeChooser` component
  from `pues/base/theme` renders `.pues-theme-chooser*` markup styled by that
  standalone `theme.css`.
- No `public/` dir; the build is just `bun build … --outdir=dist`. There is
  no `build-sw.ts` equivalent.

## Why we can't just delete the reset today

`pues/base/style/buildStyle.ts:96-122` *does* emit a default-on reset, but
it's not a drop-in for alerting:

1. **Nothing emits it.** alerting never calls `buildStyle`, so `pues.css`
   (where the reset lives) is never produced or linked.
2. **Token namespace mismatch.** The pues reset references
   `--pues-bg-page` / `--pues-text-primary`. alerting's CSS uses `--bg-*` /
   `--text-*` exclusively (every `var()` in `src/web` is on the old
   namespace; zero `--pues-*`). The vars wouldn't resolve.
3. **Not behaviour-equivalent.** pues' reset adds
   `body { padding-top: var(--pues-topbar-height, 65px) }` — a *fixed*-topbar
   pattern. alerting's topbar is `position: sticky` with no body padding, so
   adopting it as-is shoves content down. pues' reset also omits alerting's
   `-webkit-font-smoothing` and `#root { max-width; margin: 0 auto }`.

So the reset only becomes removable *after* the wiring + token rename below.

## Target wiring (mirror `../todos`)

todos generates `public/dist/pues.css` at build time and links it before
`main.css`. The reference pieces:

- `scripts/build-sw.ts` → `import { buildStyle } from "pues/base/style"`,
  `buildStyle({ root })` writes `public/dist/pues.css`.
- `package.json` build step runs that script after `build:web`.
- `src/api/server.ts` links `/dist/pues.css` then `/main.css` in the HTML
  head, and serves `public/dist/pues.css` as a static route.

## Migration steps

1. **Add a style build.** Create `scripts/build-style.ts`:

   ```ts
   import { resolve } from "node:path";
   import { buildStyle } from "pues/base/style";

   const root = resolve(import.meta.dirname, "..");
   const { path, bytes } = buildStyle({ root });
   console.log(`Style: wrote ${path} (${bytes} bytes).`);
   ```

   Wire it into `package.json` build/dev/start so `public/dist/pues.css` is
   regenerated whenever `main.tsx` is rebuilt, e.g.:

   ```json
   "build:web": "bun build src/web/main.tsx --outdir=dist --target=browser",
   "build:style": "bun run scripts/build-style.ts",
   "dev":   "bun run build:web && bun run build:style && NODE_ENV=development bun --hot src/api/server.ts",
   "start": "bun run build:web && bun run build:style && NODE_ENV=production bun run src/api/server.ts"
   ```

2. **Serve + link it.** In `src/api/server.ts`, add a static route for
   `/dist/pues.css` (alongside the existing `/main.css` handler) and add
   `<link rel="stylesheet" href="/dist/pues.css" />` to both `index.html` and
   `quota.html`, **before** the `/main.css` link so app rules can still
   override pues defaults.

3. **Drop the standalone theme.css.** pues' `defaults.css` already contains
   `.pues-theme-chooser*` (`pues/base/style/defaults.css:55-84`), so once
   `pues.css` is linked, the separate `/pues/theme.css` link, its server
   route (`server.ts:127-128`), and `main.css:521`'s custom ThemeChooser
   block become redundant. Remove them.

4. **Rename tokens `--bg-*` → `--pues-*`.** This is the bulk of the work but
   mechanical — see the mapping table below. After this, the `:root` /
   `[data-theme="light"]` blocks in `main.css:1-55` are fully supplied by
   pues' baked palette and can be deleted. alerting's current values match
   `pues/base/style/tokens.ts` `DEFAULT_TOKENS` almost exactly, so no
   `style.dark` / `style.light` overrides should be needed (verify the two
   nits in "Gaps" first).

5. **Delete the reset** (`main.css:57-72`) and let pues' reset cover it —
   *but* decide the topbar question first (see Gaps). Keep alerting-specific
   extras (`-webkit-font-smoothing`, `#root { max-width; margin: 0 auto }`)
   in `main.css`, exactly as todos keeps its extras.

6. **Opt into pues component classes incrementally** (optional, later).
   alerting currently uses zero `.pues-*` chrome classes — its topbar,
   lists, and dialogs are bespoke. Adopting `pues/base/objects` markup +
   pues' component CSS would shrink `main.css` further, but that's a separate
   pass and out of scope for the reset/token migration.

## Token mapping

YAML snake_case → CSS is mechanical (`bg_page` → `--pues-bg-page`). Every
alerting var maps 1:1 onto a pues token:

| alerting (`--…`)    | pues (`--pues-…`)   |
| ------------------- | ------------------- |
| `bg-page`           | `bg-page`           |
| `bg-surface`        | `bg-surface`        |
| `bg-raised`         | `bg-raised`         |
| `bg-raised-hover`   | `bg-raised-hover`   |
| `text-primary`      | `text-primary`      |
| `text-body`         | `text-body`         |
| `text-secondary`    | `text-secondary`    |
| `text-muted`        | `text-muted`        |
| `text-faint`        | `text-faint`        |
| `border-default`    | `border-default`    |
| `border-strong`     | `border-strong`     |
| `accent`            | `accent`            |
| `accent-hover`      | `accent-hover`      |
| `accent-light`      | `accent-light`      |
| `danger`            | `danger`            |
| `danger-hover`      | `danger-hover`      |
| `danger-active`     | `danger-active`     |
| `danger-text`       | `danger-text`       |
| `success`           | `success`           |
| `on-accent`         | `on-accent`         |
| `shadow-md`         | `shadow-md`         |
| `shadow-lg`         | `shadow-lg`         |
| `overlay`           | `overlay`           |
| `success-text`      | **(no equivalent)** — see Gaps |

Rename across `src/web/` with a scoped find/replace on `var(--<name>)` and
the `[data-theme]` declarations. `--text-body` is declared but unused by
components today; it still has a pues default, so no action needed.

## Gaps / decisions to make first

- **`--success-text`** (1 use) has no token in pues' closed vocabulary
  (`tokens.ts` has `success` but not `success_text`). Options: collapse it to
  `--pues-success`, or define it locally in `main.css` / via `style.vars`.
- **`--shadow-md`**: alerting uses `rgba(0,0,0,0.3)` dark; pues default is
  `0.35`. Cosmetic; accept pues' value or override via `style.dark.shadow_md`.
- **Topbar padding.** pues' reset assumes a fixed bar and pads the body by
  `--pues-topbar-height` (default 65px). alerting's bar is `sticky` (no body
  padding). Either (a) keep alerting's sticky bar and set
  `style.vars: { pues-topbar-height: "0px" }` so the reset adds no padding,
  or (b) switch alerting to the fixed-bar pattern and set the height to match
  (linkobot sets `pues-topbar-height: "61px"` for exactly this reason). Pick
  before deleting the reset.

## Definition of done

- `public/dist/pues.css` generated on build and linked before `main.css`.
- `src/web` references only `--pues-*` tokens; the `:root` blocks and reset
  are gone from `main.css`.
- `/pues/theme.css` link + route removed.
- App renders identically in dark + light, sticky topbar offset correct.
- `main.css` holds only alerting-specific chrome + the documented extras.
