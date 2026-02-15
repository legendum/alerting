#!/usr/bin/env bun
import { Database } from "bun:sqlite";

/**
 * Admin script: create a new coupon in data/alert.db
 *
 * Usage:
 *   bun run scripts/create-coupon.ts [quota_basic] [quota_extra]
 *   bun run scripts/create-coupon.ts 100 50
 *
 * Defaults: quota_basic=0, quota_extra=0 if not provided.
 * Prints the new coupon id (ULID) so you can share it with users to redeem.
 */

const DB_PATH = new URL("../data/alert.db", import.meta.url).pathname;

// Minimal ULID (Crockford base32): 10 chars time + 16 chars random
const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function ulid(): string {
  let t = Date.now();
  let id = "";
  for (let i = 0; i < 10; i++) {
    id = ENCODING[t % 32] + id;
    t = Math.floor(t / 32);
  }
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < 10; i++) {
    id += ENCODING[bytes[i] % 32];
  }
  return id;
}

const quotaBasic = parseInt(process.argv[2] ?? "0", 10);
const quotaExtra = parseInt(process.argv[3] ?? "0", 10);

if (isNaN(quotaBasic) || isNaN(quotaExtra) || quotaBasic < 0 || quotaExtra < 0) {
  console.error("Usage: bun run scripts/create-coupon.ts [quota_basic] [quota_extra]");
  process.exit(1);
}

const db = new Database(DB_PATH);

// Ensure coupons table exists (idempotent)
db.run(`
  CREATE TABLE IF NOT EXISTS coupons (
    id          TEXT NOT NULL PRIMARY KEY,
    quota_basic INTEGER NOT NULL DEFAULT 0,
    quota_extra INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
  )
`);

const id = ulid();
const insert = db.prepare(
  "INSERT INTO coupons (id, quota_basic, quota_extra) VALUES (?, ?, ?)"
);
insert.run(id, quotaBasic, quotaExtra);

console.log("Created coupon:");
console.log("  id:", id);
console.log("  quota_basic:", quotaBasic);
console.log("  quota_extra:", quotaExtra);
console.log("\nShare this id with users to redeem: " + id);

db.close();
