import {
  DecibelReadDex,
  DecibelWriteDex,
  getSpotMarketAddr,
  MarketDepth,
  SpotMarket,
} from "@decibeltrade/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/dex-factory.js", () => ({
  createReadDex: vi.fn(),
  createWriteDex: vi.fn(),
  resolveSubaccountAddress: vi.fn(() => undefined),
}));

const { createReadDex, createWriteDex } = await import("../services/dex-factory.js");
const { placeSpotMarketOrder } = await import("./place-spot-market-order.js");

const PACKAGE = "0x0000000000000000000000000000000000000000000000000000000000000123";
const MARKET_NAME = "APT/USDC";
const MARKET_ADDR = getSpotMarketAddr(MARKET_NAME, PACKAGE).toString();

const MARKET: SpotMarket = {
  asset_type: "spot",
  market_addr: MARKET_ADDR,
  market_name: MARKET_NAME,
  sz_decimals: 8,
  px_decimals: 6,
  max_leverage: 0,
  tick_size: 1000,
  min_size: 0,
  lot_size: 0,
  max_open_interest: 0,
  mode: "Open",
};

interface Level {
  price: number;
  size: number;
}

const placeSpotOrder = vi.fn();

function wireDex(bids: Level[], asks: Level[]) {
  const depth: MarketDepth = { market: MARKET_ADDR, bids, asks, unix_ms: 0 };

  // No `spotAssetContexts`: a market order reads the book and nothing else, so
  // a mock that served contexts would imply a dependency that is not there.
  vi.mocked(createReadDex).mockReturnValue({
    config: { deployment: { package: PACKAGE } },
    markets: { getAllSpot: () => Promise.resolve([MARKET]) },
    marketDepth: {
      subscribeByAddr: (_addr: string, _agg: number, cb: (data: MarketDepth) => void) => {
        cb(depth);
        return () => undefined;
      },
    },
  } as unknown as DecibelReadDex);

  vi.mocked(createWriteDex).mockResolvedValue({
    placeSpotOrder,
  } as unknown as DecibelWriteDex);
}

const HEALTHY_BIDS: Level[] = [
  { price: 4.5, size: 5000 },
  { price: 4.49, size: 5000 },
];
const HEALTHY_ASKS: Level[] = [
  { price: 4.51, size: 5000 },
  { price: 4.52, size: 5000 },
];

beforeEach(() => {
  vi.clearAllMocks();
  placeSpotOrder.mockResolvedValue({ success: true, orderId: "1", transactionHash: "0xabc" });
});

describe("placeSpotMarketOrder", () => {
  it("refuses the manipulated reference price described in the finding", async () => {
    // Fair value ~10; attacker brackets 101 with a $1 bid and rests inventory
    // on the ask. Nothing here should reach a signature.
    wireDex([{ price: 100, size: 0.01 }], [{ price: 102, size: 50 }]);

    await expect(
      placeSpotMarketOrder({ side: "buy", size: 10, symbol: MARKET_NAME, slippage: 1 }),
    ).rejects.toThrow();
    expect(placeSpotOrder).not.toHaveBeenCalled();
  });

  it("refuses to price a market order off the last trade alone", async () => {
    wireDex([], []);

    await expect(
      placeSpotMarketOrder({ side: "buy", size: 10, symbol: MARKET_NAME, slippage: 1 }),
    ).rejects.toThrow(/No price source/i);
    expect(placeSpotOrder).not.toHaveBeenCalled();
  });

  it("caps at executable depth rather than the mid-derived slippage price", async () => {
    wireDex(HEALTHY_BIDS, HEALTHY_ASKS);

    const result = await placeSpotMarketOrder({
      side: "buy",
      size: 100,
      symbol: MARKET_NAME,
      slippage: 1,
    });

    // Mid 4.505 alone would allow 4.55005; filling 100 only needs 4.51.
    expect(result.referencePrice).toBeCloseTo(4.505, 10);
    expect(result.limitPrice).toBeLessThan(4.55);
    expect(result.limitPrice).toBeGreaterThanOrEqual(4.51);
    expect(placeSpotOrder).toHaveBeenCalledTimes(1);
  });

  // The depth feed truncates at 20 levels per side, so a ladder shorter than
  // the order is not proof the book is. Tightening on it would cap the order
  // below liquidity the caller's own slippage allowed, turning a fillable
  // order into a partial one.
  it("does not tighten the cap when the visible ladder is truncated", async () => {
    wireDex(
      [{ price: 100, size: 1000 }],
      Array.from({ length: 20 }, (_, i) => ({ price: 100.1 + i * 0.01, size: 1 })),
    );

    const result = await placeSpotMarketOrder({
      side: "buy",
      size: 50,
      symbol: MARKET_NAME,
      slippage: 1,
    });

    // Walking to the last visible level would have capped at ~100.79.
    expect(result.referencePrice).toBeCloseTo(100.05, 10);
    expect(result.limitPrice).toBeCloseTo(101.05, 10);
    expect(result.limitPrice).toBeGreaterThan(100.8);
  });

  // A buy escrows `size * cap`, and cap carries the slippage, so sizing the
  // gate on the reference price alone lets a high-slippage buy authorize more
  // exposure than the book was asked to defend.
  it("sizes the gate on a buy's escrow, not the reference price", async () => {
    // Bids defend 1200: above 10 * 100.05, below 10 * 100.05 * 1.5.
    wireDex([{ price: 100, size: 12 }], [{ price: 100.1, size: 1000 }]);

    await expect(
      placeSpotMarketOrder({ side: "buy", size: 10, symbol: MARKET_NAME, slippage: 50 }),
    ).rejects.toThrow(/liquidity/i);
    expect(placeSpotOrder).not.toHaveBeenCalled();
  });

  // A sell's floor sits below the reference price, so sizing on the cap there
  // would ask the book to defend less than the trade is worth.
  it("keeps the gate sized on the reference price for sells", async () => {
    wireDex([{ price: 100, size: 12 }], [{ price: 100.1, size: 1000 }]);

    const result = await placeSpotMarketOrder({
      side: "sell",
      size: 10,
      symbol: MARKET_NAME,
      slippage: 50,
    });

    expect(result.success).toBe(true);
  });

  it("still places an ordinary order on a healthy book", async () => {
    wireDex(HEALTHY_BIDS, HEALTHY_ASKS);

    const result = await placeSpotMarketOrder({
      side: "sell",
      size: 100,
      symbol: MARKET_NAME,
      slippage: 1,
    });

    expect(result.success).toBe(true);
    expect(placeSpotOrder).toHaveBeenCalledTimes(1);
  });
});
