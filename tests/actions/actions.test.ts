import { describe, expect, it, vi } from "vitest";

const mockMarkets = [
  {
    market_name: "BTC/USD",
    market_addr: "0xbtc",
    max_leverage: 40,
    tick_size: 100000,
    min_size: 100000,
    lot_size: 10,
    sz_decimals: 8,
    px_decimals: 6,
    mode: "normal",
  },
];

const mockReadDex = {
  markets: { getAll: vi.fn(() => Promise.resolve(mockMarkets)) },
  marketPrices: { getByName: vi.fn() },
  userPositions: { getByAddr: vi.fn() },
  userOpenOrders: { getByAddr: vi.fn() },
  accountOverview: { getByAddr: vi.fn() },
  userTradeHistory: { getByAddr: vi.fn() },
  userOrderHistory: { getByAddr: vi.fn() },
  userTwapHistory: { getByAddr: vi.fn() },
  userActiveTwaps: { getByAddr: vi.fn() },
  userFundingHistory: { getByAddr: vi.fn() },
  marketDepth: { subscribeByName: vi.fn() },
};

const mockWriteDex = {
  placeOrder: vi.fn(),
  placeTwapOrder: vi.fn(),
  cancelOrder: vi.fn(),
  cancelTwapOrder: vi.fn(),
  configureUserSettingsForMarket: vi.fn(),
  placeTpSlOrderForPosition: vi.fn(),
  cancelTpSlOrderForPosition: vi.fn(),
};

vi.mock("@decibeltrade/sdk", () => ({
  TimeInForce: { GoodTillCanceled: 0, PostOnly: 1, ImmediateOrCancel: 2 },
  DecibelReadDex: vi.fn(),
  DecibelWriteDex: vi.fn(),
}));

vi.mock("../../src/services/dex-factory.js", () => ({
  createReadDex: vi.fn(() => mockReadDex),
  createWriteDex: vi.fn(() => Promise.resolve(mockWriteDex)),
  resolveSubaccountAddress: vi.fn(() => "0xsubaccount"),
  getConfig: vi.fn(() => ({})),
}));

import { placeLimitOrder } from "../../src/actions/place-limit-order.js";
import { placeMarketOrder } from "../../src/actions/place-market-order.js";
import { placeStopLimitOrder } from "../../src/actions/place-stop-limit-order.js";
import { placeStopMarketOrder } from "../../src/actions/place-stop-market-order.js";
import { placeTwapOrder } from "../../src/actions/place-twap-order.js";
import { closePosition } from "../../src/actions/close-position.js";
import { cancelOrder } from "../../src/actions/cancel-order.js";
import { cancelAllOrders } from "../../src/actions/cancel-all-orders.js";
import { cancelTwapOrder } from "../../src/actions/cancel-twap-order.js";
import { setLeverage } from "../../src/actions/set-leverage.js";
import { setMarginType } from "../../src/actions/set-margin-type.js";
import { placeTpSl } from "../../src/actions/place-tp-sl.js";
import { cancelTpSl } from "../../src/actions/cancel-tp-sl.js";
import { getTpSl } from "../../src/actions/get-tp-sl.js";
import { getPositions } from "../../src/actions/get-positions.js";
import { getOrders } from "../../src/actions/get-orders.js";
import { getBalances } from "../../src/actions/get-balances.js";
import { getMarkets } from "../../src/actions/get-markets.js";
import { getPrice } from "../../src/actions/get-price.js";
import { getTradeHistory } from "../../src/actions/get-trade-history.js";
import { getOrderHistory } from "../../src/actions/get-order-history.js";
import { getTwapHistory } from "../../src/actions/get-twap-history.js";
import { getActiveTwaps } from "../../src/actions/get-active-twaps.js";
import { getFundingHistory } from "../../src/actions/get-funding-history.js";

describe("trading actions", () => {
  describe("placeLimitOrder", () => {
    it("should call writeDex.placeOrder with correct params", async () => {
      mockWriteDex.placeOrder.mockResolvedValue({
        success: true,
        orderId: "order-1",
        transactionHash: "0xhash",
      });

      const result = await placeLimitOrder({
        side: "buy",
        size: 0.001,
        symbol: "BTC/USD",
        price: 95000,
        timeInForce: "gtc",
        reduceOnly: false,
      });

      expect(mockWriteDex.placeOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          marketName: "BTC/USD",
          isBuy: true,
          timeInForce: 0,
          isReduceOnly: false,
          subaccountAddr: "0xsubaccount",
        }),
      );
      expect(result.success).toBe(true);
    });

    it("should throw for unknown market", async () => {
      await expect(
        placeLimitOrder({
          side: "buy",
          size: 1,
          symbol: "DOGE/USD",
          price: 100,
          timeInForce: "gtc",
          reduceOnly: false,
        }),
      ).rejects.toThrow('Market "DOGE/USD" not found');
    });
  });

  describe("placeMarketOrder", () => {
    it("should use IOC time-in-force and apply slippage", async () => {
      mockReadDex.marketPrices.getByName.mockResolvedValue([{ mark_px: 95000 }]);
      mockWriteDex.placeOrder.mockResolvedValue({
        success: true,
        orderId: "order-2",
        transactionHash: "0xhash",
      });

      await placeMarketOrder({
        side: "buy",
        size: 0.001,
        symbol: "BTC/USD",
        slippage: 1,
        reduceOnly: false,
      });

      expect(mockWriteDex.placeOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          isBuy: true,
          timeInForce: 2, // IOC
        }),
      );
    });

    it("should throw when no price available", async () => {
      mockReadDex.marketPrices.getByName.mockResolvedValue([]);

      await expect(
        placeMarketOrder({
          side: "buy",
          size: 1,
          symbol: "BTC/USD",
          slippage: 1,
          reduceOnly: false,
        }),
      ).rejects.toThrow("Could not get current price");
    });
  });

  describe("placeStopLimitOrder", () => {
    it("should pass stopPrice to writeDex.placeOrder", async () => {
      mockWriteDex.placeOrder.mockResolvedValue({
        success: true,
        orderId: "stop-1",
        transactionHash: "0xhash",
      });

      await placeStopLimitOrder({
        side: "sell",
        size: 0.01,
        symbol: "BTC/USD",
        price: 59000,
        stopPrice: 60000,
        timeInForce: "gtc",
        reduceOnly: false,
      });

      expect(mockWriteDex.placeOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          isBuy: false,
          stopPrice: expect.any(Number),
        }),
      );
    });
  });

  describe("placeStopMarketOrder", () => {
    it("should use IOC and pass stopPrice", async () => {
      mockWriteDex.placeOrder.mockResolvedValue({
        success: true,
        orderId: "stop-m-1",
        transactionHash: "0xhash",
      });

      await placeStopMarketOrder({
        side: "sell",
        size: 0.01,
        symbol: "BTC/USD",
        stopPrice: 60000,
        slippage: 1,
        reduceOnly: true,
      });

      expect(mockWriteDex.placeOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          isBuy: false,
          timeInForce: 2, // IOC
          isReduceOnly: true,
          stopPrice: expect.any(Number),
        }),
      );
    });
  });

  describe("placeTwapOrder", () => {
    it("should call writeDex.placeTwapOrder", async () => {
      mockWriteDex.placeTwapOrder.mockResolvedValue({
        success: true,
        orderId: "twap-1",
        transactionHash: "0xhash",
      });

      const result = await placeTwapOrder({
        side: "buy",
        size: 1,
        symbol: "BTC/USD",
        duration: 3600,
        frequency: 60,
        reduceOnly: false,
      });

      expect(mockWriteDex.placeTwapOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          marketName: "BTC/USD",
          isBuy: true,
          twapFrequencySeconds: 60,
          twapDurationSeconds: 3600,
        }),
      );
      expect(result.success).toBe(true);
    });

    it("should throw when frequency exceeds duration", async () => {
      await expect(
        placeTwapOrder({
          side: "buy",
          size: 1,
          symbol: "BTC/USD",
          duration: 120,
          frequency: 180,
          reduceOnly: false,
        }),
      ).rejects.toThrow("Frequency (180s) cannot exceed duration (120s)");
    });
  });

  describe("closePosition", () => {
    it("should place reduce-only order in opposite direction", async () => {
      mockReadDex.userPositions.getByAddr.mockResolvedValue([{ market: "0xbtc", size: 0.01 }]);
      mockReadDex.marketPrices.getByName.mockResolvedValue([{ mark_px: 95000 }]);
      mockWriteDex.placeOrder.mockResolvedValue({
        success: true,
        orderId: "close-1",
        transactionHash: "0xhash",
      });

      const result = await closePosition({ symbol: "BTC/USD", slippage: 1 });

      expect(mockWriteDex.placeOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          isBuy: false, // Opposite of long
          isReduceOnly: true,
          timeInForce: 2, // IOC
        }),
      );
      expect(result.isLong).toBe(true);
    });

    it("should throw when no position found", async () => {
      mockReadDex.userPositions.getByAddr.mockResolvedValue([]);

      await expect(closePosition({ symbol: "BTC/USD", slippage: 1 })).rejects.toThrow(
        "No open position found",
      );
    });

    it("should throw when close size exceeds position", async () => {
      mockReadDex.userPositions.getByAddr.mockResolvedValue([{ market: "0xbtc", size: 0.01 }]);

      await expect(closePosition({ symbol: "BTC/USD", slippage: 1, size: 0.02 })).rejects.toThrow(
        "exceeds position size",
      );
    });
  });

  describe("cancelOrder", () => {
    it("should call writeDex.cancelOrder", async () => {
      mockWriteDex.cancelOrder.mockResolvedValue({ hash: "0xhash" });

      const result = await cancelOrder({ orderId: "123", symbol: "BTC/USD" });

      expect(mockWriteDex.cancelOrder).toHaveBeenCalledWith(
        expect.objectContaining({ orderId: "123", marketName: "BTC/USD" }),
      );
      expect(result.success).toBe(true);
      expect(result.transactionHash).toBe("0xhash");
    });
  });

  describe("cancelAllOrders", () => {
    it("should cancel all orders and return counts", async () => {
      mockReadDex.userOpenOrders.getByAddr.mockResolvedValue({
        items: [
          { order_id: "1", market: "0xbtc" },
          { order_id: "2", market: "0xbtc" },
        ],
      });
      mockWriteDex.cancelOrder.mockResolvedValue({ hash: "0xhash" });

      const result = await cancelAllOrders({});

      expect(result.cancelled).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.total).toBe(2);
    });

    it("should return zeros when no orders", async () => {
      mockReadDex.userOpenOrders.getByAddr.mockResolvedValue({ items: [] });

      const result = await cancelAllOrders({});

      expect(result).toEqual({ cancelled: 0, failed: 0, total: 0 });
    });

    it("should filter by market when symbol provided", async () => {
      mockReadDex.userOpenOrders.getByAddr.mockResolvedValue({
        items: [
          { order_id: "1", market: "0xbtc" },
          { order_id: "2", market: "0xother" },
        ],
      });
      mockWriteDex.cancelOrder.mockResolvedValue({ hash: "0xhash" });

      const result = await cancelAllOrders({ symbol: "BTC/USD" });

      expect(result.cancelled).toBe(1);
      expect(result.total).toBe(1);
    });
  });

  describe("cancelTwapOrder", () => {
    it("should look up market and call writeDex.cancelTwapOrder", async () => {
      mockWriteDex.cancelTwapOrder.mockResolvedValue({ hash: "0xhash" });

      const result = await cancelTwapOrder({ orderId: "twap-1", symbol: "BTC/USD" });

      expect(mockWriteDex.cancelTwapOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: "twap-1",
          marketAddr: "0xbtc",
        }),
      );
      expect(result.success).toBe(true);
    });
  });

  describe("setLeverage", () => {
    it("should call configureUserSettingsForMarket", async () => {
      mockWriteDex.configureUserSettingsForMarket.mockResolvedValue({ hash: "0xhash" });

      const result = await setLeverage({
        symbol: "BTC/USD",
        leverage: 10,
        marginType: "cross",
      });

      expect(mockWriteDex.configureUserSettingsForMarket).toHaveBeenCalledWith(
        expect.objectContaining({
          isCross: true,
          userLeverage: 10,
        }),
      );
      expect(result.leverage).toBe(10);
    });

    it("should throw when leverage exceeds max", async () => {
      await expect(
        setLeverage({ symbol: "BTC/USD", leverage: 50, marginType: "cross" }),
      ).rejects.toThrow("exceeds maximum 40x");
    });
  });

  describe("setMarginType", () => {
    it("should preserve current leverage when switching margin", async () => {
      mockReadDex.userPositions.getByAddr.mockResolvedValue([
        { market: "0xbtc", user_leverage: 20 },
      ]);
      mockWriteDex.configureUserSettingsForMarket.mockResolvedValue({ hash: "0xhash" });

      const result = await setMarginType({ symbol: "BTC/USD", marginType: "isolated" });

      expect(mockWriteDex.configureUserSettingsForMarket).toHaveBeenCalledWith(
        expect.objectContaining({
          isCross: false,
          userLeverage: 20,
        }),
      );
      expect(result.marginType).toBe("isolated");
      expect(result.leverage).toBe(20);
    });

    it("should default to leverage 1 when no position exists", async () => {
      mockReadDex.userPositions.getByAddr.mockResolvedValue([]);
      mockWriteDex.configureUserSettingsForMarket.mockResolvedValue({ hash: "0xhash" });

      const result = await setMarginType({ symbol: "BTC/USD", marginType: "cross" });

      expect(mockWriteDex.configureUserSettingsForMarket).toHaveBeenCalledWith(
        expect.objectContaining({ userLeverage: 1 }),
      );
      expect(result.leverage).toBe(1);
    });
  });

  describe("placeTpSl", () => {
    it("should call placeTpSlOrderForPosition with chain-converted prices", async () => {
      mockWriteDex.placeTpSlOrderForPosition.mockResolvedValue({ hash: "0xhash" });

      const result = await placeTpSl({
        symbol: "BTC/USD",
        tpTriggerPrice: 100000,
        slTriggerPrice: 60000,
      });

      expect(mockWriteDex.placeTpSlOrderForPosition).toHaveBeenCalledWith(
        expect.objectContaining({
          marketAddr: "0xbtc",
          tpTriggerPrice: expect.any(Number),
          slTriggerPrice: expect.any(Number),
        }),
      );
      expect(result.success).toBe(true);
    });
  });

  describe("cancelTpSl", () => {
    it("should call cancelTpSlOrderForPosition", async () => {
      mockWriteDex.cancelTpSlOrderForPosition.mockResolvedValue({ hash: "0xhash" });

      const result = await cancelTpSl({ orderId: "tp-1", symbol: "BTC/USD" });

      expect(mockWriteDex.cancelTpSlOrderForPosition).toHaveBeenCalledWith(
        expect.objectContaining({ orderId: "tp-1", marketAddr: "0xbtc" }),
      );
      expect(result.success).toBe(true);
    });
  });

  describe("getTpSl", () => {
    it("should return position and TP/SL orders", async () => {
      mockReadDex.userPositions.getByAddr.mockResolvedValue([
        {
          market: "0xbtc",
          size: 0.01,
          entry_price: 95000,
          tp_order_id: "tp-1",
          tp_trigger_price: 100000,
          tp_limit_price: 99500,
          sl_order_id: "sl-1",
          sl_trigger_price: 60000,
          sl_limit_price: 59500,
          has_fixed_sized_tpsls: false,
        },
      ]);
      mockReadDex.userOpenOrders.getByAddr.mockResolvedValue({
        items: [
          {
            is_tpsl: true,
            market: "0xbtc",
            order_id: "tpsl-1",
            is_buy: false,
            remaining_size: 0.005,
            price: 99500,
            order_type: "take profit",
            trigger_condition: "Price Above 100000",
            tp_trigger_price: 100000,
            tp_limit_price: 99500,
            sl_trigger_price: null,
            sl_limit_price: null,
          },
        ],
      });

      const result = await getTpSl({ symbol: "BTC/USD" });

      expect(result.position).not.toBeNull();
      expect(result.position?.tpTriggerPrice).toBe(100000);
      expect(result.orders).toHaveLength(1);
      expect(result.orders[0].orderType).toBe("take profit");
    });

    it("should return null position when none exists", async () => {
      mockReadDex.userPositions.getByAddr.mockResolvedValue([]);
      mockReadDex.userOpenOrders.getByAddr.mockResolvedValue({ items: [] });

      const result = await getTpSl({ symbol: "BTC/USD" });

      expect(result.position).toBeNull();
      expect(result.orders).toHaveLength(0);
    });
  });
});

describe("read actions", () => {
  describe("getPositions", () => {
    it("should return positions", async () => {
      mockReadDex.userPositions.getByAddr.mockResolvedValue([{ market: "0xbtc", size: 0.01 }]);

      const result = await getPositions();

      expect(result.positions).toHaveLength(1);
    });
  });

  describe("getOrders", () => {
    it("should return orders", async () => {
      mockReadDex.userOpenOrders.getByAddr.mockResolvedValue({
        items: [{ order_id: "1" }],
      });

      const result = await getOrders();

      expect(result.orders.items).toHaveLength(1);
    });
  });

  describe("getBalances", () => {
    it("should return balance info", async () => {
      mockReadDex.accountOverview.getByAddr.mockResolvedValue({
        perp_equity_balance: 10000,
        unrealized_pnl: 500,
        usdc_cross_withdrawable_balance: 5000,
        usdc_isolated_withdrawable_balance: 2000,
        total_margin: 3000,
        maintenance_margin: 1500,
      });

      const result = await getBalances();

      expect(result.perpEquityBalance).toBe(10000);
      expect(result.unrealizedPnl).toBe(500);
      expect(result.subaccountAddress).toBe("0xsubaccount");
    });
  });

  describe("getMarkets", () => {
    it("should return mapped market data", async () => {
      const result = await getMarkets();

      expect(result.markets).toHaveLength(1);
      expect(result.markets[0].name).toBe("BTC/USD");
      expect(result.markets[0].maxLeverage).toBe(40);
    });
  });

  describe("getPrice", () => {
    it("should return price data", async () => {
      mockReadDex.marketPrices.getByName.mockResolvedValue([
        {
          mark_px: 95000,
          oracle_px: 94990,
          funding_rate_bps: 5,
          open_interest: 1000,
        },
      ]);

      const result = await getPrice({ symbol: "BTC/USD" });

      expect(result.markPrice).toBe(95000);
      expect(result.oraclePrice).toBe(94990);
      expect(result.fundingRateBps).toBe(5);
    });

    it("should throw when no price data", async () => {
      mockReadDex.marketPrices.getByName.mockResolvedValue([]);

      await expect(getPrice({ symbol: "BTC/USD" })).rejects.toThrow("No price data found");
    });
  });

  describe("getTradeHistory", () => {
    it("should return trades", async () => {
      mockReadDex.userTradeHistory.getByAddr.mockResolvedValue({
        items: [{ market: "0xbtc", size: 0.01 }],
      });

      const result = await getTradeHistory({ limit: 10 });

      expect(result.trades).toHaveLength(1);
    });
  });

  describe("getOrderHistory", () => {
    it("should return orders", async () => {
      mockReadDex.userOrderHistory.getByAddr.mockResolvedValue({
        items: [{ order_id: "1", status: "Filled" }],
      });

      const result = await getOrderHistory({ limit: 10 });

      expect(result.orders).toHaveLength(1);
    });
  });

  describe("getTwapHistory", () => {
    it("should return twap history", async () => {
      mockReadDex.userTwapHistory.getByAddr.mockResolvedValue({
        items: [{ order_id: "twap-1", status: "Finished" }],
      });

      const result = await getTwapHistory({ limit: 10 });

      expect(result.twaps).toHaveLength(1);
    });
  });

  describe("getActiveTwaps", () => {
    it("should return active twaps", async () => {
      mockReadDex.userActiveTwaps.getByAddr.mockResolvedValue([
        { order_id: "twap-1", status: "Activated" },
      ]);

      const result = await getActiveTwaps();

      expect(result.twaps).toHaveLength(1);
    });
  });

  describe("getFundingHistory", () => {
    it("should return funding records", async () => {
      mockReadDex.userFundingHistory.getByAddr.mockResolvedValue({
        items: [{ market: "0xbtc", realized_funding_amount: -2.5 }],
      });

      const result = await getFundingHistory({ limit: 10 });

      expect(result.funding).toHaveLength(1);
    });
  });
});
