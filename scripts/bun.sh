#!/usr/bin/env bash
# Run bun with $HOME/bin on PATH (e.g. cron). Usage: ./scripts/bun.sh run scripts/foo.ts
export PATH="$HOME/bin:$PATH"
exec bun "$@"
