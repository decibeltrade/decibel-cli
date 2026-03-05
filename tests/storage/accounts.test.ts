import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, rmSync, mkdirSync } from "fs";

// Use vi.hoisted to define test paths before mocking
// Use require inside hoisted callback since imports aren't available yet
const { TEST_DIR, TEST_DB_PATH } = vi.hoisted(() => {
  const pathModule = require("path");
  const osModule = require("os");
  const testDir = pathModule.join(
    osModule.tmpdir(),
    "decibel-cli-accounts-test-" + Date.now() + "-" + Math.random().toString(36).slice(2),
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
import { closeDatabase, getDatabase } from "../../src/storage/database.js";
import {
  addAccount,
  getAllAccounts,
  getAccountById,
  getAccountByAlias,
  getDefaultAccount,
  setDefaultAccount,
  removeAccount,
  updateAccountAlias,
  getAptosAccount,
} from "../../src/storage/accounts.js";

// Test private key (DO NOT use in production - this is a randomly generated test key)
const TEST_PRIVATE_KEY = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
const TEST_SUBACCOUNT_ADDRESS =
  "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";

describe("accounts storage", () => {
  beforeEach(() => {
    // Ensure test directory exists and is clean
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    closeDatabase();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe("addAccount", () => {
    it("should add a read-only account", async () => {
      const account = await addAccount({
        alias: "test-readonly",
        subaccountAddress: "0x123456789abcdef",
        type: "read-only",
      });

      expect(account.alias).toBe("test-readonly");
      expect(account.address).toBe("0x123456789abcdef");
      expect(account.type).toBe("read-only");
      expect(account.encryptedKey).toBeNull();
    });

    it("should add an api-wallet account with private key", async () => {
      const account = await addAccount({
        alias: "test-wallet",
        privateKey: TEST_PRIVATE_KEY,
        subaccountAddress: TEST_SUBACCOUNT_ADDRESS,
        type: "api-wallet",
      });

      expect(account.alias).toBe("test-wallet");
      expect(account.type).toBe("api-wallet");
      expect(account.encryptedKey).not.toBeNull();
      expect(account.address).toBe(TEST_SUBACCOUNT_ADDRESS);
    });

    it("should encrypt private key when password provided", async () => {
      const account = await addAccount({
        alias: "encrypted-wallet",
        privateKey: TEST_PRIVATE_KEY,
        subaccountAddress: TEST_SUBACCOUNT_ADDRESS,
        type: "api-wallet",
        password: "test-password",
      });

      // Encrypted key should not start with 0x (raw key format)
      expect(account.encryptedKey?.startsWith("0x")).toBe(false);
    });

    it("should store unencrypted key when no password", async () => {
      const account = await addAccount({
        alias: "unencrypted-wallet",
        privateKey: TEST_PRIVATE_KEY,
        subaccountAddress: TEST_SUBACCOUNT_ADDRESS,
        type: "api-wallet",
      });

      expect(account.encryptedKey).toBe(TEST_PRIVATE_KEY);
    });

    it("should make first account default automatically", async () => {
      const account = await addAccount({
        alias: "first",
        subaccountAddress: "0x123",
        type: "read-only",
      });

      expect(account.isDefault).toBe(true);
    });

    it("should not make second account default automatically", async () => {
      await addAccount({
        alias: "first",
        subaccountAddress: "0x123",
        type: "read-only",
      });

      const second = await addAccount({
        alias: "second",
        subaccountAddress: "0x456",
        type: "read-only",
      });

      expect(second.isDefault).toBe(false);
    });

    it("should set account as default when isDefault is true", async () => {
      await addAccount({
        alias: "first",
        subaccountAddress: "0x123",
        type: "read-only",
      });

      const second = await addAccount({
        alias: "second",
        subaccountAddress: "0x456",
        type: "read-only",
        isDefault: true,
      });

      expect(second.isDefault).toBe(true);

      // First should no longer be default
      const first = getAccountByAlias("first");
      expect(first?.isDefault).toBe(false);
    });

    it("should throw error for duplicate alias", async () => {
      await addAccount({
        alias: "duplicate",
        subaccountAddress: "0x123",
        type: "read-only",
      });

      await expect(
        addAccount({
          alias: "duplicate",
          subaccountAddress: "0x456",
          type: "read-only",
        }),
      ).rejects.toThrow('Account with alias "duplicate" already exists');
    });

    it("should throw error for api-wallet without private key", async () => {
      await expect(
        addAccount({
          alias: "no-key",
          subaccountAddress: TEST_SUBACCOUNT_ADDRESS,
          type: "api-wallet",
        }),
      ).rejects.toThrow("Private key is required for api-wallet type");
    });

    it("should throw error for missing subaccount address", async () => {
      await expect(
        addAccount({
          alias: "no-address",
          subaccountAddress: "",
          type: "read-only",
        }),
      ).rejects.toThrow("Subaccount address is required");
    });

    it("should throw error for invalid private key format", async () => {
      await expect(
        addAccount({
          alias: "invalid-key",
          privateKey: "invalid-key",
          subaccountAddress: TEST_SUBACCOUNT_ADDRESS,
          type: "api-wallet",
        }),
      ).rejects.toThrow("Invalid private key format");
    });

    it("should throw error for invalid address format", async () => {
      await expect(
        addAccount({
          alias: "invalid-address",
          subaccountAddress: "not-an-address",
          type: "read-only",
        }),
      ).rejects.toThrow("Invalid address format");
    });
  });

  describe("getAllAccounts", () => {
    it("should return empty array when no accounts", () => {
      const accounts = getAllAccounts();
      expect(accounts).toEqual([]);
    });

    it("should return all accounts", async () => {
      await addAccount({ alias: "a1", subaccountAddress: "0x1", type: "read-only" });
      await addAccount({ alias: "a2", subaccountAddress: "0x2", type: "read-only" });
      await addAccount({ alias: "a3", subaccountAddress: "0x3", type: "read-only" });

      const accounts = getAllAccounts();
      expect(accounts.length).toBe(3);
    });

    it("should order default account first", async () => {
      await addAccount({ alias: "first", subaccountAddress: "0x1", type: "read-only" });
      await addAccount({
        alias: "second",
        subaccountAddress: "0x2",
        type: "read-only",
        isDefault: true,
      });

      const accounts = getAllAccounts();
      expect(accounts[0].alias).toBe("second");
    });
  });

  describe("getAccountById", () => {
    it("should return account by id", async () => {
      const created = await addAccount({
        alias: "by-id",
        subaccountAddress: "0x123",
        type: "read-only",
      });

      const found = getAccountById(created.id);
      expect(found?.alias).toBe("by-id");
    });

    it("should return null for non-existent id", () => {
      const found = getAccountById(99999);
      expect(found).toBeNull();
    });
  });

  describe("getAccountByAlias", () => {
    it("should return account by alias", async () => {
      await addAccount({
        alias: "by-alias",
        subaccountAddress: "0x123",
        type: "read-only",
      });

      const found = getAccountByAlias("by-alias");
      expect(found?.alias).toBe("by-alias");
      expect(found?.address).toBe("0x123");
    });

    it("should return null for non-existent alias", () => {
      const found = getAccountByAlias("non-existent");
      expect(found).toBeNull();
    });
  });

  describe("getDefaultAccount", () => {
    it("should return default account", async () => {
      await addAccount({ alias: "default", subaccountAddress: "0x1", type: "read-only" });

      const defaultAccount = getDefaultAccount();
      expect(defaultAccount?.alias).toBe("default");
      expect(defaultAccount?.isDefault).toBe(true);
    });

    it("should return null when no accounts", () => {
      const defaultAccount = getDefaultAccount();
      expect(defaultAccount).toBeNull();
    });

    it("should return null when no default set", async () => {
      // Add account and manually remove default flag
      await addAccount({ alias: "no-default", subaccountAddress: "0x1", type: "read-only" });

      // Manually update to remove default (edge case)
      const db = getDatabase();
      db.prepare("UPDATE accounts SET is_default = 0").run();

      const defaultAccount = getDefaultAccount();
      expect(defaultAccount).toBeNull();
    });
  });

  describe("setDefaultAccount", () => {
    it("should set account as default", async () => {
      await addAccount({ alias: "first", subaccountAddress: "0x1", type: "read-only" });
      await addAccount({ alias: "second", subaccountAddress: "0x2", type: "read-only" });

      const updated = setDefaultAccount("second");

      expect(updated.isDefault).toBe(true);

      const first = getAccountByAlias("first");
      expect(first?.isDefault).toBe(false);
    });

    it("should throw error for non-existent alias", () => {
      expect(() => setDefaultAccount("non-existent")).toThrow(
        'Account with alias "non-existent" not found',
      );
    });
  });

  describe("removeAccount", () => {
    it("should remove account by alias", async () => {
      await addAccount({ alias: "to-remove", subaccountAddress: "0x1", type: "read-only" });

      const result = removeAccount("to-remove");

      expect(result).toBe(true);
      expect(getAccountByAlias("to-remove")).toBeNull();
    });

    it("should return false for non-existent alias", () => {
      const result = removeAccount("non-existent");
      expect(result).toBe(false);
    });

    it("should make another account default when removing default", async () => {
      await addAccount({ alias: "first", subaccountAddress: "0x1", type: "read-only" });
      await addAccount({ alias: "second", subaccountAddress: "0x2", type: "read-only" });

      removeAccount("first"); // First is default

      const second = getAccountByAlias("second");
      expect(second?.isDefault).toBe(true);
    });
  });

  describe("updateAccountAlias", () => {
    it("should update account alias", async () => {
      await addAccount({ alias: "old-alias", subaccountAddress: "0x1", type: "read-only" });

      const updated = updateAccountAlias("old-alias", "new-alias");

      expect(updated.alias).toBe("new-alias");
      expect(getAccountByAlias("old-alias")).toBeNull();
      expect(getAccountByAlias("new-alias")).not.toBeNull();
    });

    it("should throw error for non-existent alias", () => {
      expect(() => updateAccountAlias("non-existent", "new")).toThrow(
        'Account with alias "non-existent" not found',
      );
    });

    it("should throw error when new alias already exists", async () => {
      await addAccount({ alias: "existing", subaccountAddress: "0x1", type: "read-only" });
      await addAccount({ alias: "to-rename", subaccountAddress: "0x2", type: "read-only" });

      expect(() => updateAccountAlias("to-rename", "existing")).toThrow(
        'Account with alias "existing" already exists',
      );
    });
  });

  describe("getAptosAccount", () => {
    it("should return Aptos Account from stored account", async () => {
      const stored = await addAccount({
        alias: "aptos-test",
        privateKey: TEST_PRIVATE_KEY,
        subaccountAddress: TEST_SUBACCOUNT_ADDRESS,
        type: "api-wallet",
      });

      const aptosAccount = await getAptosAccount(stored);

      expect(aptosAccount).toBeDefined();
      expect(aptosAccount.accountAddress.toString().startsWith("0x")).toBe(true);
    });

    it("should decrypt key with password", async () => {
      const password = "secure-password";
      const stored = await addAccount({
        alias: "encrypted-test",
        privateKey: TEST_PRIVATE_KEY,
        subaccountAddress: TEST_SUBACCOUNT_ADDRESS,
        type: "api-wallet",
        password,
      });

      const aptosAccount = await getAptosAccount(stored, password);

      expect(aptosAccount).toBeDefined();
    });

    it("should throw error for read-only account", async () => {
      const stored = await addAccount({
        alias: "readonly-test",
        subaccountAddress: "0x123",
        type: "read-only",
      });

      await expect(getAptosAccount(stored)).rejects.toThrow(
        "Cannot create Aptos Account from read-only account",
      );
    });

    it("should throw error when password required but not provided", async () => {
      const stored = await addAccount({
        alias: "needs-password",
        privateKey: TEST_PRIVATE_KEY,
        subaccountAddress: TEST_SUBACCOUNT_ADDRESS,
        type: "api-wallet",
        password: "secret",
      });

      await expect(getAptosAccount(stored)).rejects.toThrow("Password required to decrypt account");
    });
  });
});
