import { describe, expect, it, vi } from "vitest";

vi.mock("@decibeltrade/sdk", () => ({
  TimeInForce: {
    GoodTillCanceled: 0,
    PostOnly: 1,
    ImmediateOrCancel: 2,
  },
  DecibelReadDex: vi.fn(),
}));

import {
  findMarket,
  parseSide,
  parseTimeInForce,
  roundToTick,
  toChainPrice,
  toChainSize,
} from "../../src/actions/utils.js";

describe("action utils", () => {
  describe("parseSide", () => {
    it("should return true for 'buy'", () => {
      expect(parseSide("buy")).toBe(true);
    });

    it("should return true for 'long'", () => {
      expect(parseSide("long")).toBe(true);
    });

    it("should return false for 'sell'", () => {
      expect(parseSide("sell")).toBe(false);
    });

    it("should return false for 'short'", () => {
      expect(parseSide("short")).toBe(false);
    });

    it("should be case-insensitive", () => {
      expect(parseSide("BUY")).toBe(true);
      expect(parseSide("Long")).toBe(true);
      expect(parseSide("SELL")).toBe(false);
      expect(parseSide("Short")).toBe(false);
    });

    it("should throw for invalid side", () => {
      expect(() => parseSide("invalid")).toThrow('Invalid side: "invalid"');
    });

    it("should throw for empty string", () => {
      expect(() => parseSide("")).toThrow("Invalid side");
    });
  });

  describe("parseTimeInForce", () => {
    it("should parse 'gtc'", () => {
      expect(parseTimeInForce("gtc")).toBe(0);
    });

    it("should parse 'post-only'", () => {
      expect(parseTimeInForce("post-only")).toBe(1);
    });

    it("should parse 'ioc'", () => {
      expect(parseTimeInForce("ioc")).toBe(2);
    });

    it("should be case-insensitive", () => {
      expect(parseTimeInForce("GTC")).toBe(0);
      expect(parseTimeInForce("Post-Only")).toBe(1);
      expect(parseTimeInForce("IOC")).toBe(2);
    });

    it("should throw for invalid value", () => {
      expect(() => parseTimeInForce("invalid")).toThrow('Invalid time in force: "invalid"');
    });
  });

  describe("toChainPrice", () => {
    it("should convert price with 6 decimals", () => {
      expect(toChainPrice(95000, 6)).toBe(95000000000);
    });

    it("should convert fractional price", () => {
      expect(toChainPrice(3500.5, 6)).toBe(3500500000);
    });

    it("should round to nearest integer", () => {
      expect(toChainPrice(1.999999, 6)).toBe(1999999);
    });
  });

  describe("toChainSize", () => {
    it("should convert size with 8 decimals", () => {
      expect(toChainSize(0.001, 8)).toBe(100000);
    });

    it("should convert size with 7 decimals", () => {
      expect(toChainSize(0.1, 7)).toBe(1000000);
    });

    it("should convert whole number size", () => {
      expect(toChainSize(1, 8)).toBe(100000000);
    });
  });

  describe("roundToTick", () => {
    it("should round price to nearest tick", () => {
      // tick_size=100000 with px_decimals=6 means tick = 0.1 in human units
      const result = roundToTick(95000.05, 100000, 6);
      expect(result).toBe(95000.1);
    });

    it("should not change price already on tick", () => {
      const result = roundToTick(95000.0, 100000, 6);
      expect(result).toBe(95000.0);
    });

    it("should round down when closer to lower tick", () => {
      // tick = 0.1, price is 95000.04 -> rounds to 95000.0
      const result = roundToTick(95000.04, 100000, 6);
      expect(result).toBe(95000.0);
    });

    it("should handle small tick sizes", () => {
      // tick_size=10000 with px_decimals=6 means tick = 0.01
      const result = roundToTick(3500.005, 10000, 6);
      expect(result).toBe(3500.01);
    });
  });

  describe("findMarket", () => {
    const mockReadDex = {
      markets: {
        getAll: vi.fn(),
      },
    };

    const mockMarkets = [
      { market_name: "BTC/USD", market_addr: "0xbtc" },
      { market_name: "ETH/USD", market_addr: "0xeth" },
    ];

    it("should find market by name (case-insensitive)", async () => {
      mockReadDex.markets.getAll.mockResolvedValue(mockMarkets);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const market = await findMarket(mockReadDex as any, "btc/usd");
      expect(market.market_name).toBe("BTC/USD");
    });

    it("should find market with exact case", async () => {
      mockReadDex.markets.getAll.mockResolvedValue(mockMarkets);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const market = await findMarket(mockReadDex as any, "BTC/USD");
      expect(market.market_addr).toBe("0xbtc");
    });

    it("should throw for unknown market", async () => {
      mockReadDex.markets.getAll.mockResolvedValue(mockMarkets);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(findMarket(mockReadDex as any, "DOGE/USD")).rejects.toThrow(
        'Market "DOGE/USD" not found',
      );
    });
  });
});
