import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, rmSync, mkdirSync } from "fs";

// Use vi.hoisted to define test paths before mocking
// Use require inside hoisted callback since imports aren't available yet
const { TEST_DIR, TEST_DB_PATH } = vi.hoisted(() => {
  const pathModule = require("path");
  const osModule = require("os");
  const testDir = pathModule.join(
    osModule.tmpdir(),
    "decibel-cli-dex-test-" + Date.now() + "-" + Math.random().toString(36).slice(2),
  );
  return {
    TEST_DIR: testDir,
    TEST_DB_PATH: pathModule.join(testDir, "test.db"),
  };
});

// Mock the SDK
vi.mock("@decibeltrade/sdk", () => ({
  MAINNET_CONFIG: { network: "mainnet", endpoint: "https://mainnet.decibel.trade" },
  NETNA_CONFIG: { network: "netna", endpoint: "https://netna.decibel.trade" },
  TESTNET_CONFIG: { network: "testnet", endpoint: "https://testnet.decibel.trade" },
  LOCAL_CONFIG: { network: "local", endpoint: "http://localhost:8080" },
  DecibelReadDex: vi.fn().mockImplementation(function () {
    return { markets: { getAll: vi.fn() } };
  }),
  DecibelWriteDex: vi.fn().mockImplementation(function () {
    return { placeOrder: vi.fn() };
  }),
}));

// Mock config module with test paths
vi.mock("../../src/utils/config.js", async () => {
  const actual = await vi.importActual("../../src/utils/config.js");
  return {
    ...actual,
    DECIBEL_DIR: TEST_DIR,
    DATABASE_PATH: TEST_DB_PATH,
    getEnvPrivateKey: vi.fn(() => undefined),
    getEnvNodeApiKey: vi.fn(() => undefined),
    getEnvGasStationApiKey: vi.fn(() => undefined),
    getEnvSubaccountAddress: vi.fn(() => undefined),
    getEnvAccountAlias: vi.fn(() => undefined),
    getEnvNetwork: vi.fn(() => "testnet"),
    getNetworkConfig: vi.fn((network: string) => ({
      network,
      endpoint: `https://${network}.decibel.trade`,
    })),
  };
});

// Import after mocking
import { closeDatabase } from "../../src/storage/database.js";
import { addAccount } from "../../src/storage/accounts.js";
import {
  getConfig,
  createReadDex,
  resolveAccount,
  resolveSubaccountAddress,
} from "../../src/services/dex-factory.js";

// Test private key (DO NOT use in production)
const TEST_PRIVATE_KEY =
  "ed25519-priv-0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
const TEST_SUBACCOUNT_ADDRESS =
  "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";

describe("dex-factory", () => {
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
    vi.clearAllMocks();
  });

  describe("getConfig", () => {
    it("should return config object", () => {
      const config = getConfig();
      expect(config).toBeDefined();
    });

    it("should return specified network config", () => {
      const config = getConfig({ network: "netna" });
      expect(config).toBeDefined();
    });

    it("should include gasStationApiKey when provided in options", () => {
      const config = getConfig({ gasStationApiKey: "test-api-key" });
      expect(config.gasStationApiKey).toBe("test-api-key");
    });
  });

  describe("createReadDex", () => {
    it("should create a read-only SDK instance", () => {
      const dex = createReadDex();
      expect(dex).toBeDefined();
    });

    it("should accept network option", () => {
      const dex = createReadDex({ network: "netna" });
      expect(dex).toBeDefined();
    });
  });

  describe("resolveAccount", () => {
    it("should resolve account from private key option", async () => {
      const result = await resolveAccount({ privateKey: TEST_PRIVATE_KEY });

      expect(result.account).toBeDefined();
      expect(result.storedAccount).toBeUndefined();
    });

    it("should resolve account from stored account by alias", async () => {
      await addAccount({
        alias: "test-account",
        privateKey: TEST_PRIVATE_KEY,
        subaccountAddress: TEST_SUBACCOUNT_ADDRESS,
        type: "api-wallet",
      });

      const result = await resolveAccount({ accountAlias: "test-account" });

      expect(result.account).toBeDefined();
      expect(result.storedAccount).toBeDefined();
      expect(result.storedAccount?.alias).toBe("test-account");
    });

    it("should resolve account from default account", async () => {
      await addAccount({
        alias: "default-account",
        privateKey: TEST_PRIVATE_KEY,
        subaccountAddress: TEST_SUBACCOUNT_ADDRESS,
        type: "api-wallet",
      });

      const result = await resolveAccount({});

      expect(result.account).toBeDefined();
      expect(result.storedAccount?.alias).toBe("default-account");
    });

    it("should throw error when no account found", async () => {
      await expect(resolveAccount({})).rejects.toThrow("No account configured");
    });

    it("should throw error for non-existent alias", async () => {
      await expect(resolveAccount({ accountAlias: "non-existent" })).rejects.toThrow(
        'Account "non-existent" not found',
      );
    });

    it("should throw error for read-only account", async () => {
      await addAccount({
        alias: "readonly",
        subaccountAddress: TEST_SUBACCOUNT_ADDRESS,
        type: "read-only",
      });

      await expect(resolveAccount({ accountAlias: "readonly" })).rejects.toThrow(
        "read-only and cannot be used for transactions",
      );
    });
  });

  describe("resolveSubaccountAddress", () => {
    it("should resolve address from direct subaccountAddress option", () => {
      const address = resolveSubaccountAddress({ subaccountAddress: TEST_SUBACCOUNT_ADDRESS });

      expect(address).toBe(TEST_SUBACCOUNT_ADDRESS);
    });

    it("should resolve address from stored account by alias", async () => {
      const stored = await addAccount({
        alias: "addr-test",
        privateKey: TEST_PRIVATE_KEY,
        subaccountAddress: TEST_SUBACCOUNT_ADDRESS,
        type: "api-wallet",
      });

      const address = resolveSubaccountAddress({ accountAlias: "addr-test" });

      expect(address).toBe(stored.address);
    });

    it("should resolve address from read-only account", async () => {
      await addAccount({
        alias: "readonly-addr",
        subaccountAddress: TEST_SUBACCOUNT_ADDRESS,
        type: "read-only",
      });

      const address = resolveSubaccountAddress({ accountAlias: "readonly-addr" });

      expect(address).toBe(TEST_SUBACCOUNT_ADDRESS);
    });

    it("should resolve address from default account", async () => {
      const stored = await addAccount({
        alias: "default-addr",
        subaccountAddress: TEST_SUBACCOUNT_ADDRESS,
        type: "read-only",
      });

      const address = resolveSubaccountAddress({});

      expect(address).toBe(stored.address);
    });

    it("should throw error when no account configured", () => {
      expect(() => resolveSubaccountAddress({})).toThrow("No account configured");
    });

    it("should throw error for non-existent alias", () => {
      expect(() => resolveSubaccountAddress({ accountAlias: "no-such-account" })).toThrow(
        'Account "no-such-account" not found',
      );
    });
  });

  describe("priority order", () => {
    beforeEach(async () => {
      // Set up test accounts
      await addAccount({
        alias: "default-account",
        privateKey: TEST_PRIVATE_KEY,
        subaccountAddress: TEST_SUBACCOUNT_ADDRESS,
        type: "api-wallet",
        isDefault: true,
      });
    });

    it("should prioritize privateKey option over stored account", async () => {
      const differentKey =
        "ed25519-priv-0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321";
      const result = await resolveAccount({ privateKey: differentKey });

      // Should use the provided key, not the stored one
      expect(result.storedAccount).toBeUndefined();
    });

    it("should prioritize account option over default", async () => {
      await addAccount({
        alias: "named-account",
        privateKey:
          "ed25519-priv-0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321",
        subaccountAddress: "0x1111111111111111111111111111111111111111111111111111111111111111",
        type: "api-wallet",
      });

      const result = await resolveAccount({ accountAlias: "named-account" });

      expect(result.storedAccount?.alias).toBe("named-account");
    });
  });
});
