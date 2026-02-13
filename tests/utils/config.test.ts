import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { homedir } from "os";
import { join } from "path";

// Mock the SDK before importing config
vi.mock("@decibeltrade/sdk", () => ({
  NETNA_CONFIG: { network: "netna", endpoint: "https://netna.decibel.trade" },
  TESTNET_CONFIG: { network: "testnet", endpoint: "https://testnet.decibel.trade" },
  LOCAL_CONFIG: { network: "local", endpoint: "http://localhost:8080" },
}));

// Import after mocking
import {
  DECIBEL_DIR,
  DATABASE_PATH,
  SERVER_PID_PATH,
  SERVER_PORT_PATH,
  DEFAULT_NETWORK,
  NETWORK_CONFIGS,
  getNetworkConfig,
  getEnvNetwork,
  getEnvPrivateKey,
  getEnvNodeApiKey,
  getEnvGasStationApiKey,
  getEnvAccountAlias,
  getEnvSubaccountAddress,
} from "../../src/utils/config.js";

describe("config", () => {
  describe("path constants", () => {
    it("should define DECIBEL_DIR in home directory", () => {
      expect(DECIBEL_DIR).toBe(join(homedir(), ".decibel"));
    });

    it("should define DATABASE_PATH in DECIBEL_DIR", () => {
      expect(DATABASE_PATH).toBe(join(homedir(), ".decibel", "data.db"));
    });

    it("should define SERVER_PID_PATH in DECIBEL_DIR", () => {
      expect(SERVER_PID_PATH).toBe(join(homedir(), ".decibel", "server.pid"));
    });

    it("should define SERVER_PORT_PATH in DECIBEL_DIR", () => {
      expect(SERVER_PORT_PATH).toBe(join(homedir(), ".decibel", "server.port"));
    });
  });

  describe("DEFAULT_NETWORK", () => {
    it("should be testnet", () => {
      expect(DEFAULT_NETWORK).toBe("testnet");
    });
  });

  describe("NETWORK_CONFIGS", () => {
    it("should have testnet config", () => {
      expect(NETWORK_CONFIGS.testnet).toBeDefined();
    });

    it("should have netna config", () => {
      expect(NETWORK_CONFIGS.netna).toBeDefined();
    });

    it("should have local config", () => {
      expect(NETWORK_CONFIGS.local).toBeDefined();
    });
  });

  describe("getNetworkConfig", () => {
    it("should return testnet config for testnet", () => {
      const config = getNetworkConfig("testnet");
      expect(config).toBe(NETWORK_CONFIGS.testnet);
    });

    it("should return netna config for netna", () => {
      const config = getNetworkConfig("netna");
      expect(config).toBe(NETWORK_CONFIGS.netna);
    });

    it("should return local config for local", () => {
      const config = getNetworkConfig("local");
      expect(config).toBe(NETWORK_CONFIGS.local);
    });

    it("should throw error for unknown network", () => {
      expect(() => getNetworkConfig("unknown")).toThrow(
        "Unknown network: unknown. Valid networks: testnet, netna, local"
      );
    });
  });

  describe("environment variable getters", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      vi.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    describe("getEnvNetwork", () => {
      it("should return DEFAULT_NETWORK when env not set", () => {
        delete process.env.DECIBEL_NETWORK;
        expect(getEnvNetwork()).toBe("testnet");
      });

      it("should return env value when valid network", () => {
        process.env.DECIBEL_NETWORK = "netna";
        expect(getEnvNetwork()).toBe("netna");
      });

      it("should return DEFAULT_NETWORK for invalid network", () => {
        process.env.DECIBEL_NETWORK = "invalid";
        expect(getEnvNetwork()).toBe("testnet");
      });
    });

    describe("getEnvPrivateKey", () => {
      it("should return undefined when env not set", () => {
        delete process.env.DECIBEL_PRIVATE_KEY;
        expect(getEnvPrivateKey()).toBeUndefined();
      });

      it("should return env value when set", () => {
        process.env.DECIBEL_PRIVATE_KEY = "0x1234";
        expect(getEnvPrivateKey()).toBe("0x1234");
      });
    });

    describe("getEnvNodeApiKey", () => {
      it("should return undefined when env not set", () => {
        delete process.env.DECIBEL_NODE_API_KEY;
        expect(getEnvNodeApiKey()).toBeUndefined();
      });

      it("should return env value when set", () => {
        process.env.DECIBEL_NODE_API_KEY = "api-key-123";
        expect(getEnvNodeApiKey()).toBe("api-key-123");
      });
    });

    describe("getEnvGasStationApiKey", () => {
      it("should return undefined when env not set", () => {
        delete process.env.DECIBEL_GAS_STATION_API_KEY;
        expect(getEnvGasStationApiKey()).toBeUndefined();
      });

      it("should return env value when set", () => {
        process.env.DECIBEL_GAS_STATION_API_KEY = "gas-key-456";
        expect(getEnvGasStationApiKey()).toBe("gas-key-456");
      });
    });

    describe("getEnvAccountAlias", () => {
      it("should return undefined when env not set", () => {
        delete process.env.DECIBEL_ACCOUNT_ALIAS;
        expect(getEnvAccountAlias()).toBeUndefined();
      });

      it("should return env value when set", () => {
        process.env.DECIBEL_ACCOUNT_ALIAS = "my-account";
        expect(getEnvAccountAlias()).toBe("my-account");
      });
    });

    describe("getEnvSubaccountAddress", () => {
      it("should return undefined when env not set", () => {
        delete process.env.DECIBEL_SUBACCOUNT_ADDRESS;
        expect(getEnvSubaccountAddress()).toBeUndefined();
      });

      it("should return env value when set", () => {
        process.env.DECIBEL_SUBACCOUNT_ADDRESS = "0xabc123";
        expect(getEnvSubaccountAddress()).toBe("0xabc123");
      });
    });
  });
});
