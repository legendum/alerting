# Alert Project Rules

## Core Principles

1. **Bun for everything**: Use Bun as the only runtime and tooling
   - `bun run` / `bun install` instead of npm, yarn, pnpm
   - `bun <file>` instead of node / ts-node
   - `bun test` instead of jest/vitest
   - Bun.serve() for HTTP; no Express
   - `bun:sqlite` for SQLite (no better-sqlite3)
   - Frontend: Bun.serve with HTML/TSX imports and Bun's bundler; no Vite unless the project explicitly adds it later

2. **Simplicity**: Keep the app minimal per the spec
   - Email-only auth, token in link, cookie + bearer
   - Two REST calls for dashboard (events + counts, webhooks)
   - Quotas, coupons, timezone, settings as specified

3. **Code quality**: Lint before committing; fix lint errors; consistent style
   - Never add whitespace (spaces or tabs) to blank lines
   - Blank lines must be completely empty

4. **Minimal dependencies**: Prefer Bun built-ins; add packages only when necessary

## Technical Guidelines

- Use Bun.serve for HTTP (routes, optional WebSockets)
- Use `bun:sqlite` for data/alerting.db
- TypeScript strict mode
- React + Tailwind; mobile-first, portrait layout
- Follow docs/SPEC.md for API and UX; Pues resource rules in ../pues/docs/SPEC.md

## Project

- Alert PWA: webhooks → push notifications; domain alerting.app
- See docs/SPEC.md, config/schema.sql, config/pues.yaml
