#!/usr/bin/env bash
# Start all Alert services with pm2. Run from repo root: ./scripts/startup.sh
# Idempotent for cron (e.g. after reboot): quiet, and || true so "already running" doesn't stop the script.

abort() {
  echo $1
  exit
}

set -e
cd "$(dirname "$0")"
export PATH="$PATH:$HOME/bin"
[[ -f $HOME/bin/bun   ]] || abort "no ~/bin/bun"  # for Alert process executions
[[ -f $HOME/bin/node  ]] || abort "no ~/bin/node" # for pm2 (alias to bun is ok)
[[ -f $HOME/bin/pm2   ]] || abort "no ~/bin/pm2"  # for managing Alert processes

pm2 start ./alerting.sh >/dev/null 2>&1 || true   # Alerting web/webhook server
