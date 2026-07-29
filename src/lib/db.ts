import fs from "node:fs";
import path from "node:path";
import { env } from "./env";

/**
 * One async data layer over two drivers.
 *
 * Queries are written once, with `?` placeholders and SQL that both engines
 * accept. SQLite is the default so the app runs on a laptop with no accounts;
 * setting DATABASE_URL switches to Postgres with no other change. The
 * interface is async for both — SQLite is synchronous underneath, but making
 * callers await it means the driver can be swapped without touching them.
 */

export interface Database {
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
  run(sql: string, params?: unknown[]): Promise<void>;
  /** Multiple statements, no parameters. Schema only. */
  exec(sql: string): Promise<void>;
  readonly dialect: "sqlite" | "postgres";
}

/* ── Schema ─────────────────────────────────────────────────────
   Deliberately in the intersection of both dialects: TEXT, INTEGER,
   `CREATE TABLE IF NOT EXISTS`, and `CREATE INDEX IF NOT EXISTS` all
   mean the same thing to SQLite and Postgres. Anything engine-specific
   (PRAGMA, SERIAL, JSONB) stays out of here.
   ─────────────────────────────────────────────────────────────── */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL DEFAULT '',
  timezone      TEXT NOT NULL DEFAULT 'America/New_York',
  auto_pilot    INTEGER NOT NULL DEFAULT 1,
  payment_ok    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS recipients (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  relationship TEXT NOT NULL DEFAULT 'wife',
  likes        TEXT NOT NULL DEFAULT '',
  dislikes     TEXT NOT NULL DEFAULT '',
  allergies    TEXT NOT NULL DEFAULT '',
  notes        TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recipients_user ON recipients(user_id);

CREATE TABLE IF NOT EXISTS addresses (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id   TEXT NOT NULL REFERENCES recipients(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL DEFAULT 'home',
  nickname       TEXT NOT NULL DEFAULT '',
  line1          TEXT NOT NULL,
  line2          TEXT NOT NULL DEFAULT '',
  city           TEXT NOT NULL,
  state          TEXT NOT NULL,
  postal_code    TEXT NOT NULL,
  country        TEXT NOT NULL DEFAULT 'US',
  window_start   TEXT NOT NULL DEFAULT '09:00',
  window_end     TEXT NOT NULL DEFAULT '17:00',
  weekdays_only  INTEGER NOT NULL DEFAULT 0,
  delivery_notes TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_addresses_recipient ON addresses(recipient_id);

CREATE TABLE IF NOT EXISTS occasions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL REFERENCES recipients(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL DEFAULT 'birthday',
  title        TEXT NOT NULL,
  event_date   TEXT NOT NULL,
  recurring    INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_occasions_user ON occasions(user_id);

CREATE TABLE IF NOT EXISTS missions (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  occasion_id      TEXT NOT NULL REFERENCES occasions(id) ON DELETE CASCADE,
  recipient_id     TEXT NOT NULL REFERENCES recipients(id) ON DELETE CASCADE,
  address_id       TEXT NOT NULL REFERENCES addresses(id) ON DELETE RESTRICT,
  product_id       TEXT NOT NULL DEFAULT '',
  selection_mode   TEXT NOT NULL DEFAULT 'manual',
  budget_cents     INTEGER NOT NULL DEFAULT 8000,
  price_cents      INTEGER NOT NULL DEFAULT 0,
  gift_message     TEXT NOT NULL DEFAULT '',
  deliver_on       TEXT NOT NULL,
  ship_on          TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'scheduled',
  vendor_id        TEXT NOT NULL DEFAULT '',
  vendor_order_ref TEXT NOT NULL DEFAULT '',
  failure_reason   TEXT NOT NULL DEFAULT '',
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_missions_user ON missions(user_id);
CREATE INDEX IF NOT EXISTS idx_missions_ship ON missions(ship_on, status);

CREATE TABLE IF NOT EXISTS mission_events (
  id         TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  status     TEXT NOT NULL,
  note       TEXT NOT NULL DEFAULT '',
  at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_mission ON mission_events(mission_id);
`;

/**
 * Columns added after the first release. `CREATE TABLE IF NOT EXISTS` won't
 * touch an existing table, so each is added explicitly if missing. Both
 * engines accept `ADD COLUMN IF NOT EXISTS`… except SQLite, which doesn't —
 * hence the existence check rather than the shorter syntax.
 */
/* Deliberately absent: any contact detail for the recipient. Handled never
   emails, texts or calls her — see docs/MARKETING.md. Storing an address for
   her would only invite a future change that breaks the surprise. */
const ADDED_COLUMNS: [table: string, column: string, definition: string][] = [
  ["users", "stripe_customer_id", "TEXT NOT NULL DEFAULT ''"],
  ["users", "stripe_payment_method_id", "TEXT NOT NULL DEFAULT ''"],
  ["missions", "charge_ref", "TEXT NOT NULL DEFAULT ''"],
  ["missions", "vendor_payload", "TEXT NOT NULL DEFAULT ''"],
];

/* ── SQLite ─────────────────────────────────────────────────────── */

async function openSqlite(): Promise<Database> {
  // Vercel's filesystem is read-only outside /tmp, so a SQLite file can't
  // persist there. Fail with a clear instruction now, rather than a cryptic
  // EROFS from mkdirSync the moment someone hits the first page.
  if (process.env.VERCEL) {
    throw new Error(
      "No DATABASE_URL is set. On Vercel, set DATABASE_URL to a Postgres connection string " +
        "(Storage tab → Create Database, or neon.tech / supabase.com) — SQLite has nowhere to write.",
    );
  }

  const { default: SqliteDatabase } = await import("better-sqlite3");

  const dir = process.env.HANDLED_DATA_DIR ?? path.join(process.cwd(), ".data");
  fs.mkdirSync(dir, { recursive: true });

  const handle = new SqliteDatabase(path.join(dir, "handled.db"));
  handle.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  handle.exec(SCHEMA);

  for (const [table, column, definition] of ADDED_COLUMNS) {
    const columns = handle.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!columns.some((c) => c.name === column)) {
      handle.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  return {
    dialect: "sqlite",
    async all<T>(sql: string, params: unknown[] = []) {
      return handle.prepare(sql).all(...(params as never[])) as T[];
    },
    async get<T>(sql: string, params: unknown[] = []) {
      return handle.prepare(sql).get(...(params as never[])) as T | undefined;
    },
    async run(sql: string, params: unknown[] = []) {
      handle.prepare(sql).run(...(params as never[]));
    },
    async exec(sql: string) {
      handle.exec(sql);
    },
  };
}

/* ── Postgres ───────────────────────────────────────────────────── */

/** `?, ?` → `$1, $2`, skipping anything inside a quoted string literal. */
export function toPositional(sql: string): string {
  let out = "";
  let index = 0;
  let inString = false;

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    if (char === "'") {
      inString = !inString;
      out += char;
    } else if (char === "?" && !inString) {
      index += 1;
      out += `$${index}`;
    } else {
      out += char;
    }
  }
  return out;
}

/**
 * Hosted providers (Neon, Supabase, RDS) require TLS and terminate it with
 * their own CA; a local Postgres usually has no TLS at all. An explicit
 * `sslmode` in the URL always wins — that's the user telling us directly.
 */
export function sslFor(url: string): false | { rejectUnauthorized: boolean } | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { rejectUnauthorized: false };
  }

  if (parsed.searchParams.has("sslmode")) return undefined;

  const host = parsed.hostname;
  const isLocal =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "[::1]" ||
    host.endsWith(".local");

  return isLocal ? false : { rejectUnauthorized: false };
}

async function openPostgres(url: string): Promise<Database> {
  const { default: pg } = await import("pg");

  const pool = new pg.Pool({
    connectionString: url,
    ssl: sslFor(url),
    max: 5,
  });

  await pool.query(SCHEMA);
  for (const [table, column, definition] of ADDED_COLUMNS) {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${definition}`);
  }

  return {
    dialect: "postgres",
    async all<T>(sql: string, params: unknown[] = []) {
      const result = await pool.query(toPositional(sql), params);
      return result.rows as T[];
    },
    async get<T>(sql: string, params: unknown[] = []) {
      const result = await pool.query(toPositional(sql), params);
      return result.rows[0] as T | undefined;
    },
    async run(sql: string, params: unknown[] = []) {
      await pool.query(toPositional(sql), params);
    },
    async exec(sql: string) {
      await pool.query(sql);
    },
  };
}

/* ── Handle ─────────────────────────────────────────────────────── */

declare global {
  var __handledDb: Promise<Database> | undefined;
}

function connect(): Promise<Database> {
  return env.databaseUrl ? openPostgres(env.databaseUrl) : openSqlite();
}

/**
 * Cached on globalThis so dev hot-reload doesn't open a new pool per edit.
 * Callers should use `getDb()` rather than importing the promise directly.
 */
export function getDb(): Promise<Database> {
  globalThis.__handledDb ??= connect();
  return globalThis.__handledDb;
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
