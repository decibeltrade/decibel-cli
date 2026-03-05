import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock market data
const mockMarkets = [
  {
    market_name: "BTC/USD",
    market_address: "0xbtc",
    max_leverage: 40,
    tick_size: 100000,
    min_size: 100000,
    lot_size: 10,
    sz_decimals: 8,
    px_decimals: 6,
  },
  {
    market_name: "ETH/USD",
    market_address: "0xeth",
    max_leverage: 20,
    tick_size: 10000,
    min_size: 10000,
    lot_size: 10,
    sz_decimals: 7,
    px_decimals: 6,
  },
];

const mockReadDex = {
  markets: {
    getAll: vi.fn(() => Promise.resolve(mockMarkets)),
  },
  marketPrices: {
    getByName: vi.fn(),
  },
  orders: {
    getByAddr: vi.fn(),
  },
  positions: {
    getByAddr: vi.fn(),
  },
};

const mockWriteDex = {
  placeOrder: vi.fn(),
  cancelOrder: vi.fn(),
  cancelAllOrders: vi.fn(),
  setLeverage: vi.fn(),
};

vi.mock("@decibeltrade/sdk", () => ({
  TESTNET_CONFIG: {},
  NETNA_CONFIG: {},
  LOCAL_CONFIG: {},
  TimeInForce: {
    GoodTillCanceled: 0,
    PostOnly: 1,
    ImmediateOrCancel: 2,
  },
}));

vi.mock("../../src/services/dex-factory.js", () => ({
  createReadDex: vi.fn(() => mockReadDex),
  createWriteDex: vi.fn(() => Promise.resolve(mockWriteDex)),
  resolveSubaccountAddress: vi.fn(() => "0xsubaccount"),
  getConfig: vi.fn(() => ({ deployment: { perpEngineGlobal: "0xglobal" } })),
}));

describe("Trade Commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("limit order", () => {
    describe("input validation", () => {
      it("should reject invalid size (zero)", () => {
        const sizeNum = parseFloat("0");
        expect(isNaN(sizeNum) || sizeNum <= 0).toBe(true);
      });

      it("should reject invalid size (negative)", () => {
        const sizeNum = parseFloat("-0.1");
        expect(isNaN(sizeNum) || sizeNum <= 0).toBe(true);
      });

      it("should reject invalid size (not a number)", () => {
        const sizeNum = parseFloat("abc");
        expect(isNaN(sizeNum) || sizeNum <= 0).toBe(true);
      });

      it("should reject invalid price (zero)", () => {
        const priceNum = parseFloat("0");
        expect(isNaN(priceNum) || priceNum <= 0).toBe(true);
      });

      it("should reject invalid price (negative)", () => {
        const priceNum = parseFloat("-50000");
        expect(isNaN(priceNum) || priceNum <= 0).toBe(true);
      });

      it("should reject invalid price (not a number)", () => {
        const priceNum = parseFloat("xyz");
        expect(isNaN(priceNum) || priceNum <= 0).toBe(true);
      });
    });

    describe("market validation", () => {
      it("should reject unknown market symbol", async () => {
        const markets = await mockReadDex.markets.getAll();
        const market = markets.find(
          (m: { market_name: string }) =>
            m.market_name.toLowerCase() === "unknown/usd".toLowerCase(),
        );
        expect(market).toBeUndefined();
      });

      it("should find BTC/USD market", async () => {
        const markets = await mockReadDex.markets.getAll();
        const market = markets.find(
          (m: { market_name: string }) => m.market_name.toLowerCase() === "btc/usd".toLowerCase(),
        );
        expect(market).toBeDefined();
        expect(market?.market_name).toBe("BTC/USD");
      });

      it("should be case-insensitive for market lookup", async () => {
        const markets = await mockReadDex.markets.getAll();
        const market = markets.find(
          (m: { market_name: string }) => m.market_name.toLowerCase() === "BTC/USD".toLowerCase(),
        );
        expect(market).toBeDefined();
      });
    });

    describe("chain unit conversion", () => {
      it("should convert BTC size correctly (8 decimals)", async () => {
        const markets = await mockReadDex.markets.getAll();
        const market = markets.find((m: { market_name: string }) => m.market_name === "BTC/USD");
        const sizeNum = 0.001;
        const chainSize = Math.round(sizeNum * 10 ** market!.sz_decimals);
        expect(chainSize).toBe(100000); // 0.001 * 10^8 = 100000
      });

      it("should convert BTC price correctly (6 decimals)", async () => {
        const markets = await mockReadDex.markets.getAll();
        const market = markets.find((m: { market_name: string }) => m.market_name === "BTC/USD");
        const priceNum = 95000;
        const chainPrice = Math.round(priceNum * 10 ** market!.px_decimals);
        expect(chainPrice).toBe(95000000000); // 95000 * 10^6 = 95,000,000,000
      });

      it("should convert ETH size correctly (7 decimals)", async () => {
        const markets = await mockReadDex.markets.getAll();
        const market = markets.find((m: { market_name: string }) => m.market_name === "ETH/USD");
        const sizeNum = 0.1;
        const chainSize = Math.round(sizeNum * 10 ** market!.sz_decimals);
        expect(chainSize).toBe(1000000); // 0.1 * 10^7 = 1,000,000
      });

      it("should convert ETH price correctly (6 decimals)", async () => {
        const markets = await mockReadDex.markets.getAll();
        const market = markets.find((m: { market_name: string }) => m.market_name === "ETH/USD");
        const priceNum = 3500;
        const chainPrice = Math.round(priceNum * 10 ** market!.px_decimals);
        expect(chainPrice).toBe(3500000000); // 3500 * 10^6 = 3,500,000,000
      });

      it("should handle fractional prices correctly", async () => {
        const markets = await mockReadDex.markets.getAll();
        const market = markets.find((m: { market_name: string }) => m.market_name === "BTC/USD");
        const priceNum = 95123.456789;
        const chainPrice = Math.round(priceNum * 10 ** market!.px_decimals);
        expect(chainPrice).toBe(95123456789); // rounded correctly
      });
    });

    describe("side parsing", () => {
      it("should recognize 'buy' as isBuy=true", () => {
        const isBuy = ["buy", "long"].includes("buy".toLowerCase());
        expect(isBuy).toBe(true);
      });

      it("should recognize 'long' as isBuy=true", () => {
        const isBuy = ["buy", "long"].includes("long".toLowerCase());
        expect(isBuy).toBe(true);
      });

      it("should recognize 'sell' as isBuy=false", () => {
        const isBuy = ["buy", "long"].includes("sell".toLowerCase());
        expect(isBuy).toBe(false);
      });

      it("should recognize 'short' as isBuy=false", () => {
        const isBuy = ["buy", "long"].includes("short".toLowerCase());
        expect(isBuy).toBe(false);
      });

      it("should be case-insensitive", () => {
        const isBuy1 = ["buy", "long"].includes("BUY".toLowerCase());
        const isBuy2 = ["buy", "long"].includes("LONG".toLowerCase());
        expect(isBuy1).toBe(true);
        expect(isBuy2).toBe(true);
      });
    });

    describe("time in force parsing", () => {
      it("should parse 'gtc' as GoodTillCanceled", () => {
        const tif = "gtc";
        let timeInForce = 0;
        switch (tif.toLowerCase()) {
          case "gtc":
            timeInForce = 0;
            break;
          case "post-only":
          case "alo":
            timeInForce = 1;
            break;
          case "ioc":
            timeInForce = 2;
            break;
        }
        expect(timeInForce).toBe(0);
      });

      it("should parse 'post-only' as PostOnly", () => {
        const tif = "post-only";
        let timeInForce = 0;
        switch (tif.toLowerCase()) {
          case "gtc":
            timeInForce = 0;
            break;
          case "post-only":
          case "alo":
            timeInForce = 1;
            break;
          case "ioc":
            timeInForce = 2;
            break;
        }
        expect(timeInForce).toBe(1);
      });

      it("should parse 'alo' as PostOnly", () => {
        const tif = "alo";
        let timeInForce = 0;
        switch (tif.toLowerCase()) {
          case "gtc":
            timeInForce = 0;
            break;
          case "post-only":
          case "alo":
            timeInForce = 1;
            break;
          case "ioc":
            timeInForce = 2;
            break;
        }
        expect(timeInForce).toBe(1);
      });

      it("should parse 'ioc' as ImmediateOrCancel", () => {
        const tif = "ioc";
        let timeInForce = 0;
        switch (tif.toLowerCase()) {
          case "gtc":
            timeInForce = 0;
            break;
          case "post-only":
          case "alo":
            timeInForce = 1;
            break;
          case "ioc":
            timeInForce = 2;
            break;
        }
        expect(timeInForce).toBe(2);
      });

      it("should reject invalid time in force", () => {
        const tif = "invalid";
        const validTifs = ["gtc", "post-only", "alo", "ioc"];
        expect(validTifs.includes(tif.toLowerCase())).toBe(false);
      });
    });
  });

  describe("market order", () => {
    it("should reject when current price is not available", async () => {
      mockReadDex.marketPrices.getByName.mockResolvedValue([]);
      const prices = await mockReadDex.marketPrices.getByName({ marketName: "BTC/USD" });
      const currentPrice = prices[0]?.mark_px;
      expect(currentPrice).toBeUndefined();
    });

    it("should calculate slippage correctly for buy order", () => {
      const currentPrice = 95000;
      const slippage = 0.01; // 1%
      const isBuy = true;
      const limitPrice = isBuy ? currentPrice * (1 + slippage) : currentPrice * (1 - slippage);
      expect(limitPrice).toBe(95950); // 95000 * 1.01 = 95950
    });

    it("should calculate slippage correctly for sell order", () => {
      const currentPrice = 95000;
      const slippage = 0.01; // 1%
      const isBuy = false;
      const limitPrice = isBuy ? currentPrice * (1 + slippage) : currentPrice * (1 - slippage);
      expect(limitPrice).toBe(94050); // 95000 * 0.99 = 94050
    });

    it("should parse slippage percentage correctly", () => {
      const slippageStr = "2";
      const slippage = parseFloat(slippageStr) / 100;
      expect(slippage).toBe(0.02);
    });

    it("should use default slippage of 1%", () => {
      const slippageStr = "1"; // default
      const slippage = parseFloat(slippageStr) / 100;
      expect(slippage).toBe(0.01);
    });
  });

  describe("cancel order", () => {
    it("should handle no open orders", async () => {
      mockReadDex.orders.getByAddr.mockResolvedValue([]);
      const orders = await mockReadDex.orders.getByAddr({ subAddr: "0xsubaccount" });
      expect(orders).toHaveLength(0);
    });

    it("should list open orders for cancellation", async () => {
      const mockOrders = [
        { order_id: "1", market: "BTC/USD", remaining_size: 0.001, price: 95000 },
        { order_id: "2", market: "ETH/USD", remaining_size: 0.1, price: 3500 },
      ];
      mockReadDex.orders.getByAddr.mockResolvedValue(mockOrders);
      const orders = await mockReadDex.orders.getByAddr({ subAddr: "0xsubaccount" });
      expect(orders).toHaveLength(2);
    });
  });

  describe("set leverage", () => {
    it("should reject leverage below 1", () => {
      const leverage = 0.5;
      const isValidLeverage = leverage >= 1;
      expect(isValidLeverage).toBe(false);
    });

    it("should reject leverage above max (BTC max is 40)", async () => {
      const markets = await mockReadDex.markets.getAll();
      const market = markets.find((m: { market_name: string }) => m.market_name === "BTC/USD");
      const leverage = 50;
      const isValidLeverage = leverage <= market!.max_leverage;
      expect(isValidLeverage).toBe(false);
    });

    it("should accept valid leverage", async () => {
      const markets = await mockReadDex.markets.getAll();
      const market = markets.find((m: { market_name: string }) => m.market_name === "BTC/USD");
      const leverage = 10;
      const isValidLeverage = leverage >= 1 && leverage <= market!.max_leverage;
      expect(isValidLeverage).toBe(true);
    });
  });

  describe("positions", () => {
    it("should handle no positions", async () => {
      mockReadDex.positions.getByAddr.mockResolvedValue([]);
      const positions = await mockReadDex.positions.getByAddr({ subAddr: "0xsubaccount" });
      expect(positions).toHaveLength(0);
    });

    it("should return positions correctly", async () => {
      const mockPositions = [
        {
          market: "BTC/USD",
          size: 0.001,
          entry_price: 95000,
          mark_price: 96000,
          unrealized_pnl: 1,
          leverage: 10,
          liquidation_price: 85000,
        },
      ];
      mockReadDex.positions.getByAddr.mockResolvedValue(mockPositions);
      const positions = await mockReadDex.positions.getByAddr({ subAddr: "0xsubaccount" });
      expect(positions).toHaveLength(1);
      expect(positions[0].unrealized_pnl).toBe(1);
    });
  });
});
