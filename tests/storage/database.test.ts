import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { existsSync, rmSync, mkdirSync } from "fs";
import path from "path";
import os from "os";

// Use vi.hoisted to define test paths before mocking
// Import path/os inside the hoisted callback since imports aren't available yet
const { TEST_DIR, TEST_DB_PATH } = vi.hoisted(() => {
  const pathModule = require("path");
  const osModule = require("os");
  const testDir = pathModule.join(
    osModule.tmpdir(),
    "decibel-cli-db-test-" + Date.now() + "-" + Math.random().toString(36).slice(2),
  );
  return {
    TEST_DIR: testDir,
    TEST_DB_PATH: pathModule.join(testDir, "test.db"),
  };
});

// Mock the config module to use a test database path
vi.mock("../../src/utils/config.js", () => ({
  DECIBEL_DIR: TEST_DIR,
  DATABASE_PATH: TEST_DB_PATH,
}));

// Import after mocking
import { getDatabase, closeDatabase, runMigration } from "../../src/storage/database.js";

describe("database", () => {
  beforeEach(() => {
    // Ensure test directory exists
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    // Close and cleanup
    closeDatabase();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe("getDatabase", () => {
    it("should create database file if not exists", () => {
      const db = getDatabase();
      expect(db).toBeInstanceOf(Database);
      expect(existsSync(TEST_DB_PATH)).toBe(true);
    });

    it("should return same instance on subsequent calls", () => {
      const db1 = getDatabase();
      const db2 = getDatabase();
      expect(db1).toBe(db2);
    });

    it("should create accounts table", () => {
      const db = getDatabase();
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='accounts'")
        .all();
      expect(tables.length).toBe(1);
    });

    it("should create settings table", () => {
      const db = getDatabase();
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'")
        .all();
      expect(tables.length).toBe(1);
    });

    it("should create indexes on accounts table", () => {
      const db = getDatabase();
      const indexes = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='accounts'")
        .all() as { name: string }[];

      const indexNames = indexes.map((i) => i.name);
      expect(indexNames).toContain("idx_accounts_alias");
      expect(indexNames).toContain("idx_accounts_address");
      expect(indexNames).toContain("idx_accounts_default");
    });

    it("should use WAL journal mode", () => {
      const db = getDatabase();
      const result = db.pragma("journal_mode") as { journal_mode: string }[];
      expect(result[0].journal_mode).toBe("wal");
    });
  });

  describe("closeDatabase", () => {
    it("should close the database connection", () => {
      getDatabase(); // Open the connection
      closeDatabase();

      // After closing, getDatabase should create a new instance
      const db = getDatabase();
      expect(db).toBeInstanceOf(Database);
    });

    it("should not throw if called multiple times", () => {
      getDatabase();
      expect(() => closeDatabase()).not.toThrow();
      expect(() => closeDatabase()).not.toThrow();
    });

    it("should not throw if database was never opened", () => {
      expect(() => closeDatabase()).not.toThrow();
    });
  });

  describe("runMigration", () => {
    it("should run migration if version is higher than current", () => {
      const db = getDatabase();
      let migrationRan = false;

      runMigration(db, 1, () => {
        migrationRan = true;
        db.exec("ALTER TABLE settings ADD COLUMN test_col TEXT");
      });

      expect(migrationRan).toBe(true);
    });

    it("should update db_version after migration", () => {
      const db = getDatabase();

      runMigration(db, 1, () => {});

      const version = db.prepare("SELECT value FROM settings WHERE key = 'db_version'").get() as {
        value: string;
      };
      expect(version.value).toBe("1");
    });

    it("should not run migration if version already applied", () => {
      const db = getDatabase();
      let migrationCount = 0;

      runMigration(db, 1, () => {
        migrationCount++;
      });

      runMigration(db, 1, () => {
        migrationCount++;
      });

      expect(migrationCount).toBe(1);
    });

    it("should run multiple migrations in order", () => {
      const db = getDatabase();
      const order: number[] = [];

      runMigration(db, 1, () => order.push(1));
      runMigration(db, 2, () => order.push(2));
      runMigration(db, 3, () => order.push(3));

      expect(order).toEqual([1, 2, 3]);

      const version = db.prepare("SELECT value FROM settings WHERE key = 'db_version'").get() as {
        value: string;
      };
      expect(version.value).toBe("3");
    });
  });

  describe("accounts table schema", () => {
    it("should have correct columns", () => {
      const db = getDatabase();
      const columns = db.prepare("PRAGMA table_info(accounts)").all() as {
        name: string;
        type: string;
        notnull: number;
      }[];

      const columnMap = new Map(columns.map((c) => [c.name, c]));

      expect(columnMap.get("id")?.type).toBe("INTEGER");
      expect(columnMap.get("alias")?.type).toBe("TEXT");
      expect(columnMap.get("address")?.type).toBe("TEXT");
      expect(columnMap.get("encrypted_key")?.type).toBe("TEXT");
      expect(columnMap.get("type")?.type).toBe("TEXT");
      expect(columnMap.get("is_default")?.type).toBe("INTEGER");
      expect(columnMap.get("created_at")?.type).toBe("TEXT");
      expect(columnMap.get("updated_at")?.type).toBe("TEXT");
    });

    it("should enforce alias uniqueness", () => {
      const db = getDatabase();

      db.prepare("INSERT INTO accounts (alias, address, type) VALUES (?, ?, ?)").run(
        "test",
        "0x123",
        "read-only",
      );

      expect(() =>
        db
          .prepare("INSERT INTO accounts (alias, address, type) VALUES (?, ?, ?)")
          .run("test", "0x456", "read-only"),
      ).toThrow();
    });

    it("should enforce type check constraint", () => {
      const db = getDatabase();

      expect(() =>
        db
          .prepare("INSERT INTO accounts (alias, address, type) VALUES (?, ?, ?)")
          .run("test", "0x123", "invalid-type"),
      ).toThrow();
    });
  });
});
