import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";

import { DATABASE_PATH, DECIBEL_DIR } from "../utils/config.js";

let db: Database.Database | null = null;

/**
 * Initialize the database connection and create tables if needed
 */
export function getDatabase(): Database.Database {
  if (db) {
    return db;
  }

  // Ensure the data directory exists
  if (!existsSync(DECIBEL_DIR)) {
    mkdirSync(DECIBEL_DIR, { recursive: true });
  }

  db = new Database(DATABASE_PATH);
  db.pragma("journal_mode = WAL");

  initializeTables(db);

  return db;
}

/**
 * Create database tables if they don't exist
 */
function initializeTables(database: Database.Database): void {
  // Accounts table
  database.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alias TEXT UNIQUE NOT NULL,
      address TEXT NOT NULL,
      encrypted_key TEXT,
      type TEXT NOT NULL CHECK (type IN ('api-wallet', 'read-only')),
      is_default INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Settings table
  database.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Create indexes
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_accounts_alias ON accounts(alias);
    CREATE INDEX IF NOT EXISTS idx_accounts_address ON accounts(address);
    CREATE INDEX IF NOT EXISTS idx_accounts_default ON accounts(is_default);
  `);
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Run a database migration
 */
export function runMigration(
  database: Database.Database,
  version: number,
  migration: () => void
): void {
  const currentVersion = database
    .prepare("SELECT value FROM settings WHERE key = 'db_version'")
    .get() as { value: string } | undefined;

  const current = currentVersion ? parseInt(currentVersion.value, 10) : 0;

  if (current < version) {
    migration();
    database
      .prepare(
        "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('db_version', ?, datetime('now'))"
      )
      .run(version.toString());
  }
}
