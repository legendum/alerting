import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { applyMigrations, applySchema } from "pues/base/db/server";

const root = join(import.meta.dir, "..");

function columnNames(db: Database, table: string): string[] {
  return (
    db.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  ).map((row) => row.name);
}

function createOldSchema(db: Database): void {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE
    );

    CREATE TABLE webhooks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id),
      ulid        TEXT NOT NULL UNIQUE,
      name        TEXT NOT NULL,
      policy      TEXT,
      created_at  INTEGER NOT NULL
    );

    CREATE TABLE webhook_events (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      webhook_id INTEGER NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id),
      title      TEXT,
      body       TEXT,
      read_at    INTEGER,
      created_at INTEGER NOT NULL
    );
  `);
}

function applyCurrentSchemaAndMigrations(db: Database): void {
  applySchema(db, root);
  applyMigrations(db, root);
}

describe("webhooks position migration", () => {
  test("adds position to existing databases", () => {
    const db = new Database(":memory:");
    createOldSchema(db);

    expect(columnNames(db, "webhooks")).not.toContain("position");

    applyCurrentSchemaAndMigrations(db);

    expect(columnNames(db, "webhooks")).toContain("position");
    const migration = db
      .query("SELECT migration FROM migrations WHERE migration = ?")
      .get("001_add_webhooks_position.sql");
    expect(migration).toEqual({
      migration: "001_add_webhooks_position.sql",
    });
  });

  test("backfills each user's positions by recent alert activity", () => {
    const db = new Database(":memory:");
    createOldSchema(db);
    db.exec(`
      INSERT INTO users (id, email) VALUES
        (1, 'alice@example.com'),
        (2, 'bob@example.com');

      INSERT INTO webhooks (id, user_id, ulid, name, created_at) VALUES
        (1, 1, 'alice-old', 'Alice old', 100),
        (2, 1, 'alice-active', 'Alice active', 200),
        (3, 1, 'alice-mid', 'Alice mid', 300),
        (4, 2, 'bob-active', 'Bob active', 100),
        (5, 2, 'bob-quiet', 'Bob quiet', 400);

      INSERT INTO webhook_events (webhook_id, user_id, title, created_at) VALUES
        (1, 1, 'old event', 150),
        (2, 1, 'newest event', 900),
        (3, 1, 'middle event', 500),
        (4, 2, 'bob newest event', 800);
    `);

    applyCurrentSchemaAndMigrations(db);

    const rows = db
      .query("SELECT ulid, position FROM webhooks ORDER BY user_id, position")
      .all() as Array<{ ulid: string; position: number }>;

    expect(rows).toEqual([
      { ulid: "alice-active", position: 1000 },
      { ulid: "alice-mid", position: 2000 },
      { ulid: "alice-old", position: 3000 },
      { ulid: "bob-active", position: 1000 },
      { ulid: "bob-quiet", position: 2000 },
    ]);
  });

  test("does not rewrite positions after the migration is recorded", () => {
    const db = new Database(":memory:");
    createOldSchema(db);
    db.exec(`
      INSERT INTO users (id, email) VALUES (1, 'alice@example.com');
      INSERT INTO webhooks (id, user_id, ulid, name, created_at) VALUES
        (1, 1, 'first', 'First', 100),
        (2, 1, 'second', 'Second', 200);
    `);

    applyCurrentSchemaAndMigrations(db);
    db.run("UPDATE webhooks SET position = ? WHERE ulid = ?", [4242, "first"]);

    applyCurrentSchemaAndMigrations(db);

    const row = db.query("SELECT position FROM webhooks WHERE ulid = ?").get(
      "first",
    ) as { position: number };
    expect(row.position).toBe(4242);
  });

  test("fresh schema already has position and marks the migration applied", () => {
    const db = new Database(":memory:");

    applySchema(db, root);

    expect(columnNames(db, "webhooks")).toContain("position");
    expect(
      db
        .query("SELECT migration FROM migrations WHERE migration = ?")
        .get("001_add_webhooks_position.sql"),
    ).toEqual({ migration: "001_add_webhooks_position.sql" });

    applyMigrations(db, root);
  });
});
