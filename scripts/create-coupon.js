#!/usr/bin/env bun
import { Database } from "bun:sqlite";
/**
 * Admin script: create a new coupon in data/alert.db
 *
 * Usage:
 *   bun run scripts/create-coupon.ts [quota_extra]
 *   bun run scripts/create-coupon.ts 100
 *
 * Default: quota_extra=0 if not provided. On redemption, this amount is added to the user's quota_extra.
 * Prints the new coupon id (ULID) so you can share it with users to redeem.
 */
const DB_PATH = new URL("../data/alert.db", import.meta.url).pathname;
// Minimal ULID (Crockford base32): 10 chars time + 16 chars random
const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
function ulid() {
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
const quotaExtra = parseInt(process.argv[2] ?? "0", 10);
if (isNaN(quotaExtra) || quotaExtra < 0) {
    console.error("Usage: bun run scripts/create-coupon.ts [quota_extra]");
    process.exit(1);
}
const db = new Database(DB_PATH);
// Ensure coupons table exists (idempotent); column order matches schema.sql
db.run(`
  CREATE TABLE IF NOT EXISTS coupons (
    id          TEXT NOT NULL PRIMARY KEY,
    user_id     INTEGER REFERENCES users(id),
    price       INTEGER NOT NULL DEFAULT 0,
    quota_extra INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    redeemed_at INTEGER
  )
`);
const id = ulid();
const insert = db.prepare("INSERT INTO coupons (id, quota_extra) VALUES (?, ?)");
insert.run(id, quotaExtra);
console.log("Created coupon:");
console.log("  id:", id);
console.log("  quota_extra:", quotaExtra);
console.log("\nShare this id with users to redeem: " + id);
db.close();
