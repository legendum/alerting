import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { applyMigrations } from "pues/base/db/server";
import { toWebhookSlug } from "../src/lib/webhookSlug.js";

const root = join(import.meta.dir, "..");

describe("webhooks slug migration", () => {
  test("adds slug column and backfills from ulid", () => {
    const db = new Database(":memory:");
    db.run("PRAGMA foreign_keys = ON");
    db.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE);
      CREATE TABLE webhooks (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL,
        ulid TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        policy TEXT,
        position INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE migrations (
        migration TEXT PRIMARY KEY,
        applied_at INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO migrations (migration) VALUES ('001_add_webhooks_position.sql');
      INSERT INTO users (id, email) VALUES (1, 'a@example.com');
      INSERT INTO webhooks (user_id, ulid, name, position) VALUES
        (1, '01ABCDEF', 'Hook', 1000);
    `);

    applyMigrations(db, root);

    const row = db
      .query("SELECT slug FROM webhooks WHERE ulid = '01ABCDEF'")
      .get() as { slug: string };
    expect(row.slug).toBe("01abcdef");
  });
});

describe("toWebhookSlug", () => {
  test("slugifies labels like fifos", () => {
    expect(toWebhookSlug("My Hook")).toBe("my-hook");
    expect(toWebhookSlug("  alerts!  ")).toBe("alerts");
  });
});
