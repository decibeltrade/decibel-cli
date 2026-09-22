import { describe, expect, it, vi } from "vitest";

/** Test deployment package, and the addresses spot markets derive from it. */
const PKG = "0x0000000000000000000000000000000000000000000000000000000000000123";
/** getSpotMarketAddr("APT/USDC", PKG) — pinned by a test below. */
const APT_ADDR = "0xa0769cb4de927021e407bf1023d0aaf60f08503abc0c69b03796e68813e25038";
const ETH_ADDR = "0xfd7e84e3f3f98be6495f36cc35c6eee32def524caab2e46f9e5eb46fe56dca26";

const spotMarket = {
  asset_type: "spot" as const,
  market_name: "APT/USDC",
  market_addr: APT_ADDR,
  max_leverage: 0,
  tick_size: 100,
  min_size: 1_000_000_000,
  lot_size: 10_000_000,
  max_open_interest: 0,
  sz_decimals: 8,
  px_decimals: 6,
  mode: "Open",
};

const spotAssetContext = {
  market_addr: APT_ADDR,
  name: "APT/USDC",
  ticker_id: "APT_USDC",
  base_asset_addr: "0xbase",
  quote_asset_addr: "0xquote",
  base_decimals: 8,
  quote_decimals: 6,
  last_price: 4,
  mid: 4.5,
  prev_day_price: 5,
  volume_24h_base: 100,
  volume_24h_quote: 450,
  high_24h: 6,
  low_24h: 3,
  timestamp_unix_ms: 1_700_000_000_000,
};

/** Depth snapshot pushed to the next `subscribeByAddr` listener, or null to stay silent. */
let nextDepthSnapshot: unknown = null;

const mockReadDex = {
  config: { deployment: { package: PKG } },
  markets: {
    getAll: vi.fn(() => Promise.resolve([spotMarket])),
    getAllSpot: vi.fn(() => Promise.resolve([spotMarket])),
  },
  spotAssetContexts: { getAll: vi.fn(() => Promise.resolve([spotAssetContext])) },
  accountOverview: { getByAddr: vi.fn() },
  userOpenOrders: { getByAddr: vi.fn() },
  userTradeHistory: { getByAddr: vi.fn() },
  userOrderHistory: { getByAddr: vi.fn() },
  marketDepth: {
    subscribeByAddr: vi.fn((_addr: string, _agg: number, onData: (d: unknown) => void) => {
      if (nextDepthSnapshot !== null) {
        onData(nextDepthSnapshot);
      }
      return () => undefined;
    }),
  },
};

const mockWriteDex = {
  placeSpotOrder: vi.fn(),
  cancelSpotOrder: vi.fn(),
};

// `roundToTickSizeForSide` comes from the real SDK: the market-order action
// reports the price it submits at, and that claim is only true if it rounds
// exactly the way the SDK does on the way to chain.
vi.mock("@decibeltrade/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@decibeltrade/sdk")>();
  return {
    roundToTickSizeForSide: actual.roundToTickSizeForSide,
    getSpotMarketAddr: actual.getSpotMarketAddr,
    TimeInForce: { GoodTillCanceled: 0, PostOnly: 1, ImmediateOrCancel: 2 },
    DecibelReadDex: vi.fn(),
    DecibelWriteDex: vi.fn(),
  };
});

vi.mock("../../src/services/dex-factory.js", () => ({
  createReadDex: vi.fn(() => mockReadDex),
  createWriteDex: vi.fn(() => Promise.resolve(mockWriteDex)),
  resolveSubaccountAddress: vi.fn(() => "0xsubaccount"),
  getConfig: vi.fn(() => ({})),
}));

import { cancelAllSpotOrders } from "../../src/actions/cancel-all-spot-orders.js";
import { cancelSpotOrder } from "../../src/actions/cancel-spot-order.js";
import { getSpotBalances } from "../../src/actions/get-spot-balances.js";
import { getSpotMarkets } from "../../src/actions/get-spot-markets.js";
import { getSpotOrderbook } from "../../src/actions/get-spot-orderbook.js";
import { getSpotOrderHistory } from "../../src/actions/get-spot-order-history.js";
import { getSpotOrders } from "../../src/actions/get-spot-orders.js";
import { getSpotPrice } from "../../src/actions/get-spot-price.js";
import { getSpotTradeHistory } from "../../src/actions/get-spot-trade-history.js";
import { placeSpotLimitOrder } from "../../src/actions/place-spot-limit-order.js";
import {
  placeSpotMarketOrder,
  PlaceSpotMarketOrderSchema,
} from "../../src/actions/place-spot-market-order.js";

function resetMocks() {
  nextDepthSnapshot = null;
  mockWriteDex.placeSpotOrder.mockReset();
  mockWriteDex.cancelSpotOrder.mockReset();
  mockReadDex.marketDepth.subscribeByAddr.mockClear();
  // Restores the default too: a `mockResolvedValueOnce` a test queues but never
  // reaches would otherwise be waiting for whichever test reads contexts next.
  mockReadDex.spotAssetContexts.getAll.mockReset();
  mockReadDex.spotAssetContexts.getAll.mockResolvedValue([spotAssetContext]);
  mockReadDex.accountOverview.getByAddr.mockReset();
  mockReadDex.userOpenOrders.getByAddr.mockReset();
  mockReadDex.userTradeHistory.getByAddr.mockReset();
  mockReadDex.userOrderHistory.getByAddr.mockReset();
}

interface BookOrder {
  order_id: string;
  market: string;
  asset_type: string;
}

/**
 * Model `/open_orders` as a real book: paginate over the live set, and drop an
 * order once it is successfully cancelled. A static mock would re-serve
 * cancelled orders forever and turn any retry loop into a false failure.
 */
function mockOpenOrderBook(orders: BookOrder[], opts: { staleReads?: number } = {}) {
  const book = new Map(orders.map((o) => [o.order_id, o]));
  // The trading API reads open orders from ClickHouse, which lags on-chain
  // cancellations. `staleReads` replays the snapshot taken at the start of a
  // sweep, so already-cancelled orders keep coming back.
  let staleReadsLeft = opts.staleReads ?? 0;
  let snapshot: BookOrder[] | undefined;

  mockReadDex.userOpenOrders.getByAddr.mockImplementation(
    ({ offset = 0, limit = 500 }: { offset?: number; limit?: number }) => {
      if (offset === 0) {
        if (staleReadsLeft > 0 && snapshot) {
          staleReadsLeft--;
        } else {
          snapshot = [...book.values()];
        }
      }
      const live = snapshot ?? [...book.values()];
      return Promise.resolve({
        items: live.slice(offset, offset + limit),
        total_count: live.length,
      });
    },
  );

  return book;
}

/** Cancel succeeds and removes the order, unless its id is in `failing`. */
function mockCancelsExcept(book: Map<string, BookOrder>, failing: Set<string> = new Set()) {
  mockWriteDex.cancelSpotOrder.mockImplementation(({ orderId }: { orderId: string }) => {
    if (failing.has(orderId)) return Promise.reject(new Error("boom"));
    book.delete(orderId);
    return Promise.resolve({ hash: "0xhash" });
  });
}

describe("placeSpotLimitOrder", () => {
  it("sends the order by market address with chain-scaled price/size and the tick size", async () => {
    resetMocks();
    mockWriteDex.placeSpotOrder.mockResolvedValue({
      success: true,
      orderId: "1",
      pendingCbs: false,
      transactionHash: "0xhash",
    });

    const result = await placeSpotLimitOrder({
      side: "buy",
      size: 1.5,
      symbol: "APT/USDC",
      price: 4.25,
      timeInForce: "gtc",
    });

    expect(mockWriteDex.placeSpotOrder).toHaveBeenCalledWith({
      // By NAME: the SDK derives the on-chain address deterministically, so a
      // stale or tampered `market_addr` cannot redirect the order elsewhere.
      marketName: "APT/USDC",
      // 4.25 * 10^6 quote decimals, 1.5 * 10^8 base decimals
      price: 4_250_000,
      size: 150_000_000,
      isBuy: true,
      timeInForce: 0,
      tickSize: 100,
      subaccountAddr: "0xsubaccount",
    });
    expect(result.success).toBe(true);
  });

  it("rounds a buy limit DOWN to the tick so the caller's price is never exceeded", async () => {
    resetMocks();
    mockWriteDex.placeSpotOrder.mockResolvedValue({
      success: true,
      orderId: "1",
      pendingCbs: false,
      transactionHash: "0xhash",
    });

    // 4.250_060 in chain units is 42500.6 ticks of 100 — nearest-tick rounding
    // would push a buy UP over the price the caller named.
    await placeSpotLimitOrder({
      side: "buy",
      size: 1,
      symbol: "APT/USDC",
      price: 4.25006,
      timeInForce: "gtc",
    });

    const args = mockWriteDex.placeSpotOrder.mock.calls[0][0] as { price: number };
    expect(args.price).toBe(4_250_000);
  });

  it("rounds a sell limit UP to the tick so the caller's price is never undercut", async () => {
    resetMocks();
    mockWriteDex.placeSpotOrder.mockResolvedValue({
      success: true,
      orderId: "1",
      pendingCbs: false,
      transactionHash: "0xhash",
    });

    await placeSpotLimitOrder({
      side: "sell",
      size: 1,
      symbol: "APT/USDC",
      price: 4.25006,
      timeInForce: "gtc",
    });

    const args = mockWriteDex.placeSpotOrder.mock.calls[0][0] as { price: number };
    expect(args.price).toBe(4_250_100);
  });

  // Scaling with Math.round can cross a tick boundary before the side-safe
  // rounding runs, silently breaching the limit the caller typed.
  it("holds the buy limit when scaling to chain units is fractional", async () => {
    resetMocks();
    mockWriteDex.placeSpotOrder.mockResolvedValue({
      success: true,
      orderId: "1",
      pendingCbs: false,
      transactionHash: "0xhash",
    });

    await placeSpotLimitOrder({
      side: "buy",
      size: 1,
      symbol: "APT/USDC",
      price: 4.5450996,
      timeInForce: "gtc",
    });

    const args = mockWriteDex.placeSpotOrder.mock.calls[0][0] as { price: number };
    expect(args.price).toBe(4_545_000);
    expect(args.price / 10 ** 6).toBeLessThanOrEqual(4.5450996);
  });

  it("maps post-only and ioc time-in-force", async () => {
    resetMocks();
    mockWriteDex.placeSpotOrder.mockResolvedValue({
      success: true,
      orderId: "1",
      pendingCbs: false,
      transactionHash: "0xhash",
    });

    await placeSpotLimitOrder({
      side: "sell",
      size: 1,
      symbol: "APT/USDC",
      price: 4,
      timeInForce: "post-only",
    });
    expect(
      (mockWriteDex.placeSpotOrder.mock.calls[0][0] as { timeInForce: number; isBuy: boolean })
        .timeInForce,
    ).toBe(1);
    expect((mockWriteDex.placeSpotOrder.mock.calls[0][0] as { isBuy: boolean }).isBuy).toBe(false);

    await placeSpotLimitOrder({
      side: "sell",
      size: 1,
      symbol: "APT/USDC",
      price: 4,
      timeInForce: "ioc",
    });
    expect(
      (mockWriteDex.placeSpotOrder.mock.calls[1][0] as { timeInForce: number }).timeInForce,
    ).toBe(2);
  });

  it("surfaces the pendingCbs flag when the order is queued behind a CBS withdrawal", async () => {
    resetMocks();
    mockWriteDex.placeSpotOrder.mockResolvedValue({
      success: true,
      orderId: "7",
      pendingCbs: true,
      transactionHash: "0xhash",
    });

    const result = await placeSpotLimitOrder({
      side: "buy",
      size: 1,
      symbol: "APT/USDC",
      price: 4,
      timeInForce: "gtc",
    });

    expect(result).toMatchObject({ success: true, pendingCbs: true });
  });

  // Placement carries no address at all: the SDK derives it from the name, so
  // there is nothing in the payload a market row could redirect.
  it("places by name and never sends a market address", async () => {
    resetMocks();
    mockWriteDex.placeSpotOrder.mockResolvedValue({
      success: true,
      orderId: "1",
      pendingCbs: false,
      transactionHash: "0xhash",
    });

    await placeSpotLimitOrder({
      side: "buy",
      size: 1,
      symbol: "APT/USDC",
      price: 4,
      timeInForce: "gtc",
    });

    const args = mockWriteDex.placeSpotOrder.mock.calls[0][0] as Record<string, unknown>;
    expect(args.marketName).toBe("APT/USDC");
    expect(args).not.toHaveProperty("marketAddr");
  });

  it("derives from the canonical market name, not the user's casing", async () => {
    resetMocks();
    mockWriteDex.placeSpotOrder.mockResolvedValue({
      success: true,
      orderId: "1",
      pendingCbs: false,
      transactionHash: "0xhash",
    });

    // Symbol matching is case-insensitive, but the address derives from the
    // exact on-chain name — deriving from the typed casing would miss.
    await placeSpotLimitOrder({
      side: "buy",
      size: 1,
      symbol: "apt/usdc",
      price: 4,
      timeInForce: "gtc",
    });

    expect(
      (mockWriteDex.placeSpotOrder.mock.calls[0][0] as { marketName: string }).marketName,
    ).toBe("APT/USDC");
  });

  // The write derives its market address from the name while price discovery
  // reads the API's `market_addr`. If those ever disagree we would price off
  // one market and trade on another, so the lookup refuses to proceed.
  it("rejects a market row whose address disagrees with its derived address", async () => {
    resetMocks();
    mockReadDex.markets.getAllSpot.mockResolvedValueOnce([
      { ...spotMarket, market_addr: ETH_ADDR },
    ]);

    await expect(
      placeSpotLimitOrder({
        side: "buy",
        size: 1,
        symbol: "APT/USDC",
        price: 4,
        timeInForce: "gtc",
      }),
    ).rejects.toThrow(/does not match its on-chain address/i);
    expect(mockWriteDex.placeSpotOrder).not.toHaveBeenCalled();
  });

  // Pins the fixture constant: if address derivation ever changes, this fails
  // here rather than silently making every other test assert the wrong thing.
  it("derives the fixture address the SDK derives", async () => {
    const { getSpotMarketAddr } = await import("@decibeltrade/sdk");
    expect(getSpotMarketAddr("APT/USDC", PKG).toString()).toBe(APT_ADDR);
    expect(getSpotMarketAddr("ETH/USDC", PKG).toString()).toBe(ETH_ADDR);
  });

  it("rejects a perp market symbol", async () => {
    resetMocks();
    await expect(
      placeSpotLimitOrder({
        side: "buy",
        size: 1,
        symbol: "BTC/USD",
        price: 100,
        timeInForce: "gtc",
      }),
    ).rejects.toThrow('Spot market "BTC/USD" not found');
    expect(mockWriteDex.placeSpotOrder).not.toHaveBeenCalled();
  });
});

/**
 * A two-sided book with resting size on both legs, which a market order now
 * requires.
 *
 * Tests that assert cap arithmetic pick `bid`/`ask` so the executable-depth
 * bound stays looser than the slippage bound, leaving slippage the binding
 * term — the thing those tests are actually about.
 */
function twoSidedBook(bid: number, ask: number) {
  return {
    best_bid: bid,
    best_ask: ask,
    bids: [{ price: bid, size: 1_000_000 }],
    asks: [{ price: ask, size: 1_000_000 }],
  };
}

describe("placeSpotMarketOrder", () => {
  it("prices an IOC buy at the book mid plus slippage", async () => {
    resetMocks();
    nextDepthSnapshot = twoSidedBook(4.47, 4.53);
    mockWriteDex.placeSpotOrder.mockResolvedValue({
      success: true,
      orderId: "1",
      pendingCbs: false,
      transactionHash: "0xhash",
    });

    const result = await placeSpotMarketOrder({
      side: "buy",
      size: 2,
      symbol: "APT/USDC",
      slippage: 1,
    });

    // mid = 4.5, +1% = 4.545
    expect(mockWriteDex.placeSpotOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        marketName: "APT/USDC",
        price: 4_545_000,
        size: 200_000_000,
        isBuy: true,
        timeInForce: 2,
        tickSize: 100,
      }),
    );
    expect(result.referencePrice).toBe(4.5);
    expect(result.limitPrice).toBeCloseTo(4.545, 9);
  });

  // The response documents limitPrice as the price actually submitted, so it
  // has to be the tick-aligned one, not the raw slippage cap.
  it("reports the tick-aligned submitted price, rounding a buy cap DOWN", async () => {
    resetMocks();
    // mid 4.5451235 -> cap at 0% slippage is 4545123.5 chain units, which is
    // 45451.235 ticks of 100: not aligned, and rounding up would exceed the cap.
    nextDepthSnapshot = twoSidedBook(4.5251235, 4.5651235);
    mockWriteDex.placeSpotOrder.mockResolvedValue({
      success: true,
      orderId: "1",
      pendingCbs: false,
      transactionHash: "0xhash",
    });

    const result = await placeSpotMarketOrder({
      side: "buy",
      size: 1,
      symbol: "APT/USDC",
      slippage: 0,
    });

    const submitted = mockWriteDex.placeSpotOrder.mock.calls[0][0] as { price: number };
    expect(submitted.price).toBe(4_545_100);
    expect(result.limitPrice).toBe(4.5451);
    expect(result.limitPrice).toBeLessThanOrEqual(result.referencePrice);
  });

  it("reports the tick-aligned submitted price, rounding a sell floor UP", async () => {
    resetMocks();
    nextDepthSnapshot = twoSidedBook(4.5251235, 4.5651235);
    mockWriteDex.placeSpotOrder.mockResolvedValue({
      success: true,
      orderId: "1",
      pendingCbs: false,
      transactionHash: "0xhash",
    });

    const result = await placeSpotMarketOrder({
      side: "sell",
      size: 1,
      symbol: "APT/USDC",
      slippage: 0,
    });

    const submitted = mockWriteDex.placeSpotOrder.mock.calls[0][0] as { price: number };
    expect(submitted.price).toBe(4_545_200);
    expect(result.limitPrice).toBe(4.5452);
    expect(result.limitPrice).toBeGreaterThanOrEqual(result.referencePrice);
  });

  // Scaling to chain units with Math.round can push the value across a tick
  // boundary before the side-safe rounding ever sees it, so the bound has to
  // be enforced on the exact fractional value.
  it("never submits a buy above the cap when scaling is fractional", async () => {
    resetMocks();
    // cap * 10^6 = 4_545_099.6 — nearest-integer scaling gives 4_545_100,
    // which is already tick-aligned and sits ABOVE the cap.
    nextDepthSnapshot = twoSidedBook(4.5250996, 4.5650996);
    mockWriteDex.placeSpotOrder.mockResolvedValue({
      success: true,
      orderId: "1",
      pendingCbs: false,
      transactionHash: "0xhash",
    });

    const result = await placeSpotMarketOrder({
      side: "buy",
      size: 1,
      symbol: "APT/USDC",
      slippage: 0,
    });

    const submitted = mockWriteDex.placeSpotOrder.mock.calls[0][0] as { price: number };
    expect(submitted.price).toBe(4_545_000);
    expect(result.limitPrice).toBeLessThanOrEqual(4.5450996);
  });

  it("never submits a sell below the floor when scaling is fractional", async () => {
    resetMocks();
    // floor * 10^6 = 4_545_100.4 — nearest-integer scaling gives 4_545_100,
    // which is tick-aligned and sits BELOW the floor.
    nextDepthSnapshot = twoSidedBook(4.5251004, 4.5651004);
    mockWriteDex.placeSpotOrder.mockResolvedValue({
      success: true,
      orderId: "1",
      pendingCbs: false,
      transactionHash: "0xhash",
    });

    const result = await placeSpotMarketOrder({
      side: "sell",
      size: 1,
      symbol: "APT/USDC",
      slippage: 0,
    });

    const submitted = mockWriteDex.placeSpotOrder.mock.calls[0][0] as { price: number };
    expect(submitted.price).toBe(4_545_200);
    expect(result.limitPrice).toBeGreaterThanOrEqual(4.5451004);
  });

  it("rejects a 100% sell slippage instead of submitting a zero price", async () => {
    resetMocks();
    nextDepthSnapshot = twoSidedBook(4.428, 4.572);

    expect(() =>
      PlaceSpotMarketOrderSchema.parse({
        side: "sell",
        size: 1,
        symbol: "APT/USDC",
        slippage: 100,
      }),
    ).toThrow(/slippage/i);
    expect(mockWriteDex.placeSpotOrder).not.toHaveBeenCalled();
  });

  it("still allows a 100% buy slippage, which is merely expensive", () => {
    expect(() =>
      PlaceSpotMarketOrderSchema.parse({
        side: "buy",
        size: 1,
        symbol: "APT/USDC",
        slippage: 100,
      }),
    ).not.toThrow();
  });

  it("refuses to submit when a buy cap rounds down to zero", async () => {
    resetMocks();
    // A buy floors to the tick, so a sub-tick cap rounds away to 0 — which the
    // contract rejects. Fail before spending a signature on a certain abort.
    // (Sells ceil, so they land on one tick instead; the schema catches the
    // only sell case that reaches zero, a 100% slippage.)
    nextDepthSnapshot = twoSidedBook(0.000088, 0.000092);

    await expect(
      placeSpotMarketOrder({ side: "buy", size: 1, symbol: "APT/USDC", slippage: 0 }),
    ).rejects.toThrow(/invalid spot limit price/i);
    expect(mockWriteDex.placeSpotOrder).not.toHaveBeenCalled();
  });

  it("reports a limitPrice that always matches the price sent to the SDK", async () => {
    resetMocks();
    nextDepthSnapshot = twoSidedBook(4.5251235, 4.5651235);
    mockWriteDex.placeSpotOrder.mockResolvedValue({
      success: true,
      orderId: "1",
      pendingCbs: false,
      transactionHash: "0xhash",
    });

    const result = await placeSpotMarketOrder({
      side: "buy",
      size: 1,
      symbol: "APT/USDC",
      slippage: 1.7,
    });

    const submitted = mockWriteDex.placeSpotOrder.mock.calls[0][0] as { price: number };
    expect(Math.round(result.limitPrice * 10 ** 6)).toBe(submitted.price);
  });

  it("prices an IOC sell at the book mid minus slippage", async () => {
    resetMocks();
    nextDepthSnapshot = twoSidedBook(4.428, 4.572);
    mockWriteDex.placeSpotOrder.mockResolvedValue({
      success: true,
      orderId: "1",
      pendingCbs: false,
      transactionHash: "0xhash",
    });

    await placeSpotMarketOrder({ side: "sell", size: 2, symbol: "APT/USDC", slippage: 2 });

    // mid = 4.5, -2% = 4.41
    expect(
      mockWriteDex.placeSpotOrder.mock.calls[0][0] as { price: number; timeInForce: number },
    ).toMatchObject({ price: 4_410_000, timeInForce: 2 });
  });

  // A lone quote on a thin book is set by whoever posted it, and the
  // asset-context mid is no escape: it is the same book computed server-side,
  // and it arrives without the levels needed to tell a real market from a
  // posted one. With nothing left to vet, the order is refused.
  it("refuses a one-sided book rather than falling through to the asset context", async () => {
    resetMocks();
    nextDepthSnapshot = {
      best_bid: null,
      best_ask: null,
      bids: [{ price: 40, size: 1 }],
      asks: [],
    };

    await expect(
      placeSpotMarketOrder({ side: "buy", size: 1, symbol: "APT/USDC", slippage: 0 }),
    ).rejects.toThrow(/No price source/);
    expect(mockWriteDex.placeSpotOrder).not.toHaveBeenCalled();
  });

  it("refuses to price a market order off a one-sided book with no trade history", async () => {
    resetMocks();
    nextDepthSnapshot = {
      best_bid: null,
      best_ask: null,
      asks: [{ price: 999, size: 1 }],
      bids: [],
    };

    await expect(
      placeSpotMarketOrder({ side: "buy", size: 1, symbol: "APT/USDC", slippage: 1 }),
    ).rejects.toThrow(/No price source/);
    expect(mockWriteDex.placeSpotOrder).not.toHaveBeenCalled();
  });

  it("refuses the asset-context mid when the depth feed has no price", async () => {
    resetMocks();
    nextDepthSnapshot = { best_bid: null, best_ask: null, bids: [], asks: [] };

    await expect(
      placeSpotMarketOrder({ side: "buy", size: 1, symbol: "APT/USDC", slippage: 0 }),
    ).rejects.toThrow(/No price source/);
    expect(mockWriteDex.placeSpotOrder).not.toHaveBeenCalled();
  });

  // The last trade is the cheapest value on the API to forge — one wash trade
  // between two controlled accounts on an empty book — and nothing in the
  // payload dates it, so a print from weeks ago reads as current.
  it("refuses the last trade price when the asset context has no mid", async () => {
    resetMocks();
    nextDepthSnapshot = { best_bid: null, best_ask: null, bids: [], asks: [] };

    await expect(
      placeSpotMarketOrder({ side: "buy", size: 1, symbol: "APT/USDC", slippage: 0 }),
    ).rejects.toThrow(/No price source/);
    expect(mockWriteDex.placeSpotOrder).not.toHaveBeenCalled();
  });

  it("refuses a book too thin to defend its own midpoint", async () => {
    resetMocks();
    // Fair value is ~4.5; the bracketing quotes cost about a dollar to post.
    nextDepthSnapshot = {
      best_bid: 100,
      best_ask: 102,
      bids: [{ price: 100, size: 0.01 }],
      asks: [{ price: 102, size: 50 }],
    };

    await expect(
      placeSpotMarketOrder({ side: "buy", size: 10, symbol: "APT/USDC", slippage: 1 }),
    ).rejects.toThrow(/liquidity/i);
    expect(mockWriteDex.placeSpotOrder).not.toHaveBeenCalled();
  });

  it("throws instead of guessing when no price source has a price", async () => {
    resetMocks();
    nextDepthSnapshot = { best_bid: null, best_ask: null, bids: [], asks: [] };

    await expect(
      placeSpotMarketOrder({ side: "buy", size: 1, symbol: "APT/USDC", slippage: 1 }),
    ).rejects.toThrow(/No price source/);
    expect(mockWriteDex.placeSpotOrder).not.toHaveBeenCalled();
  });
});

describe("cancelSpotOrder", () => {
  it("cancels through the spot entry function using the derived market address", async () => {
    resetMocks();
    mockWriteDex.cancelSpotOrder.mockResolvedValue({ hash: "0xhash" });

    const result = await cancelSpotOrder({ orderId: "42", symbol: "APT/USDC" });

    expect(mockWriteDex.cancelSpotOrder).toHaveBeenCalledWith({
      orderId: "42",
      marketName: "APT/USDC",
      subaccountAddr: "0xsubaccount",
    });
    expect(result).toMatchObject({ success: true, transactionHash: "0xhash" });
  });

  // Cancelling by id is the only way to reach an order queued behind a CBS
  // withdrawal. Blocking it on the off-chain market list would leave such an
  // order live to execute when the queue drains, so the lookup is best-effort.
  it("still cancels when the market is missing from the market list", async () => {
    resetMocks();
    mockReadDex.markets.getAllSpot.mockResolvedValueOnce([]);
    mockWriteDex.cancelSpotOrder.mockResolvedValue({ hash: "0xhash" });

    const result = await cancelSpotOrder({ orderId: "42", symbol: "APT/USDC" });

    expect(mockWriteDex.cancelSpotOrder).toHaveBeenCalledWith({
      orderId: "42",
      marketName: "APT/USDC",
      subaccountAddr: "0xsubaccount",
    });
    expect(result.marketNameVerified).toBe(false);
  });

  it("still cancels when the market list itself is unavailable", async () => {
    resetMocks();
    mockReadDex.markets.getAllSpot.mockRejectedValueOnce(new Error("503"));
    mockWriteDex.cancelSpotOrder.mockResolvedValue({ hash: "0xhash" });

    const result = await cancelSpotOrder({ orderId: "42", symbol: "APT/USDC" });

    expect(result).toMatchObject({ success: true, marketNameVerified: false });
  });

  // A cancel derives its address from the NAME and never reads the reported
  // market_addr, so an address mismatch must not cost it the canonical casing.
  // Falling back to the typed casing there would derive a nonexistent address
  // and abort on chain — the exact outcome this fallback exists to prevent.
  it("keeps the canonical casing even when the market address fails its check", async () => {
    resetMocks();
    mockReadDex.markets.getAllSpot.mockResolvedValueOnce([
      { ...spotMarket, market_addr: ETH_ADDR },
    ]);
    mockWriteDex.cancelSpotOrder.mockResolvedValue({ hash: "0xhash" });

    const result = await cancelSpotOrder({ orderId: "42", symbol: "apt/usdc" });

    expect(
      (mockWriteDex.cancelSpotOrder.mock.calls[0][0] as { marketName: string }).marketName,
    ).toBe("APT/USDC");
    expect(result.marketNameVerified).toBe(true);
  });

  it("uses the canonical casing when the market list is available", async () => {
    resetMocks();
    mockWriteDex.cancelSpotOrder.mockResolvedValue({ hash: "0xhash" });

    // Deriving the address from the typed casing would miss the market
    // entirely, so the lookup is still worth attempting first.
    const result = await cancelSpotOrder({ orderId: "42", symbol: "apt/usdc" });

    expect(
      (mockWriteDex.cancelSpotOrder.mock.calls[0][0] as { marketName: string }).marketName,
    ).toBe("APT/USDC");
    expect(result.marketNameVerified).toBe(true);
  });
});

describe("cancelAllSpotOrders", () => {
  const order = (id: string, market = APT_ADDR): BookOrder => ({
    order_id: id,
    market,
    asset_type: "spot",
  });

  it("only reads spot open orders and cancels each by its own market address", async () => {
    resetMocks();
    const book = mockOpenOrderBook([order("1"), order("2", ETH_ADDR)]);
    mockCancelsExcept(book);

    const result = await cancelAllSpotOrders({});

    expect(mockReadDex.userOpenOrders.getByAddr).toHaveBeenCalledWith({
      subAddr: "0xsubaccount",
      assetType: "spot",
      limit: 500,
      offset: 0,
    });
    expect(mockWriteDex.cancelSpotOrder).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ cancelled: 2, failed: 0, total: 2 });
  });

  // `/open_orders` defaults to a page size of 10, so a single unpaginated
  // fetch would leave everything past the first page open under a command
  // called "cancel all".
  it("pages through every open order rather than stopping at the first page", async () => {
    resetMocks();
    const book = mockOpenOrderBook(Array.from({ length: 1200 }, (_, i) => order(String(i))));
    mockCancelsExcept(book);

    const result = await cancelAllSpotOrders({});

    // 1200 orders is three pages of 500, then a final empty pass.
    expect(mockReadDex.userOpenOrders.getByAddr).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ offset: 500, limit: 500 }),
    );
    expect(result).toEqual({ cancelled: 1200, failed: 0, total: 1200 });
    expect(book.size).toBe(0);
  });

  // Offset pagination tops out at 10_500 orders. Cancelling that many and
  // reporting completion would leave the rest open with no signal.
  it("keeps cancelling in further passes when one pass cannot see every order", async () => {
    resetMocks();
    const book = mockOpenOrderBook(Array.from({ length: 10_501 }, (_, i) => order(String(i))));
    mockCancelsExcept(book);

    const result = await cancelAllSpotOrders({});

    expect(result).toEqual({ cancelled: 10_501, failed: 0, total: 10_501 });
    expect(book.size).toBe(0);
  });

  // ClickHouse lags the chain, so a sweep can re-read orders it just
  // cancelled. Treating those failed re-cancels as "no progress" would end the
  // run while orders past the pagination window are still open.
  it("waits out a stale read instead of reporting a complete sweep", async () => {
    resetMocks();
    const book = mockOpenOrderBook(
      Array.from({ length: 10_501 }, (_, i) => order(String(i))),
      { staleReads: 2 },
    );
    mockCancelsExcept(book);

    const result = await cancelAllSpotOrders({}, {}, { sleep: () => Promise.resolve() });

    expect(result).toEqual({ cancelled: 10_501, failed: 0, total: 10_501 });
    expect(book.size).toBe(0);
  });

  it("never re-submits a cancel for an order it already cancelled", async () => {
    resetMocks();
    const book = mockOpenOrderBook(
      Array.from({ length: 600 }, (_, i) => order(String(i))),
      { staleReads: 3 },
    );
    mockCancelsExcept(book);

    await cancelAllSpotOrders({}, {}, { sleep: () => Promise.resolve() });

    const ids = mockWriteDex.cancelSpotOrder.mock.calls.map(
      (c) => (c[0] as { orderId: string }).orderId,
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("fails loudly when the API never advances past the cancelled window", async () => {
    resetMocks();
    const book = mockOpenOrderBook(
      Array.from({ length: 10_501 }, (_, i) => order(String(i))),
      { staleReads: Number.MAX_SAFE_INTEGER },
    );
    mockCancelsExcept(book);

    await expect(cancelAllSpotOrders({}, {}, { sleep: () => Promise.resolve() })).rejects.toThrow(
      /could not confirm|incomplete/i,
    );
  });

  it("does not claim success when cancels stop working while still truncated", async () => {
    resetMocks();
    const all = Array.from({ length: 10_501 }, (_, i) => order(String(i)));
    const book = mockOpenOrderBook(all);
    // Nothing can be cancelled at all, and the window is full: reporting a
    // clean sweep here would hide 10_501 live orders.
    mockCancelsExcept(book, new Set(all.map((o) => o.order_id)));

    await expect(cancelAllSpotOrders({}, {}, { sleep: () => Promise.resolve() })).rejects.toThrow(
      /could not confirm|incomplete/i,
    );
  });

  it("stops instead of looping forever when a pass cancels nothing", async () => {
    resetMocks();
    const book = mockOpenOrderBook([order("1")]);
    mockCancelsExcept(book, new Set(["1"]));

    const result = await cancelAllSpotOrders({});

    expect(result).toEqual({ cancelled: 0, failed: 1, total: 1 });
    expect(mockWriteDex.cancelSpotOrder).toHaveBeenCalledTimes(1);
  });

  it("counts a retried order once, not once per pass", async () => {
    resetMocks();
    const book = mockOpenOrderBook([order("1"), order("2")]);
    mockCancelsExcept(book, new Set(["2"]));

    const result = await cancelAllSpotOrders({});

    // Order 2 is retried on the second pass, then gives up — still one order.
    expect(result).toEqual({ cancelled: 1, failed: 1, total: 2 });
    expect(mockWriteDex.cancelSpotOrder).toHaveBeenCalledTimes(3);
  });

  it("filters to a single market when a symbol is given", async () => {
    resetMocks();
    const book = mockOpenOrderBook([order("1"), order("2", ETH_ADDR)]);
    mockCancelsExcept(book);

    const result = await cancelAllSpotOrders({ symbol: "APT/USDC" });

    expect(mockWriteDex.cancelSpotOrder).toHaveBeenCalledTimes(1);
    expect(mockWriteDex.cancelSpotOrder).toHaveBeenCalledWith({
      orderId: "1",
      marketAddr: APT_ADDR,
      subaccountAddr: "0xsubaccount",
    });
    expect(result).toEqual({ cancelled: 1, failed: 0, total: 1 });
  });

  it("counts failures without aborting the rest", async () => {
    resetMocks();
    const book = mockOpenOrderBook([order("1"), order("2")]);
    mockCancelsExcept(book, new Set(["1"]));

    expect(await cancelAllSpotOrders({})).toEqual({ cancelled: 1, failed: 1, total: 2 });
  });

  it("does not create a write dex when there is nothing to cancel", async () => {
    resetMocks();
    mockOpenOrderBook([]);
    mockCancelsExcept(new Map());

    expect(await cancelAllSpotOrders({})).toEqual({ cancelled: 0, failed: 0, total: 0 });
    expect(mockWriteDex.cancelSpotOrder).not.toHaveBeenCalled();
  });

  // A market filter is applied AFTER pagination, so a window packed with other
  // markets' orders can hide every matching order behind the offset ceiling.
  // Those non-matching orders are not ours to cancel, so they never move and no
  // number of passes helps — say so instead of promising a re-run will work.
  it("reports market-filtered cancellation as unreachable, not retryable", async () => {
    resetMocks();
    mockOpenOrderBook(Array.from({ length: 11_000 }, (_, i) => order(String(i), ETH_ADDR)));
    mockCancelsExcept(new Map());
    const sleep = vi.fn(() => Promise.resolve());

    const error = await cancelAllSpotOrders({ symbol: "APT/USDC" }, {}, { sleep }).catch(
      (e: Error) => e,
    );

    expect(error.message).toMatch(/^Unreachable:/);
    expect(error.message).not.toMatch(/Re-run to continue/);
    // No point backing off: the window is not going to change.
    expect(sleep).not.toHaveBeenCalled();
    expect(mockWriteDex.cancelSpotOrder).not.toHaveBeenCalled();
  });

  // Partial progress is the dangerous shape: a pass cancels the matching orders
  // it can see, the next pass finds none, and an error that omits the count
  // reads as a total failure — nudging the caller toward an unfiltered
  // cancel-all that would wipe out every other market too.
  it("names how many it cancelled when the rest turn out to be unreachable", async () => {
    resetMocks();
    const book = mockOpenOrderBook([
      // Reachable in the first window...
      ...Array.from({ length: 100 }, (_, i) => order(`apt-front-${i}`)),
      ...Array.from({ length: 10_800 }, (_, i) => order(`eth-${i}`, ETH_ADDR)),
      // ...but these sit past the offset ceiling once the front ones are gone.
      ...Array.from({ length: 100 }, (_, i) => order(`apt-back-${i}`)),
    ]);
    mockCancelsExcept(book);

    const error = await cancelAllSpotOrders(
      { symbol: "APT/USDC" },
      {},
      { sleep: () => Promise.resolve() },
    ).catch((e: Error) => e);

    // The 100 it did cancel are real and must be reported.
    expect(mockWriteDex.cancelSpotOrder).toHaveBeenCalledTimes(100);
    expect(error.message).toMatch(/cancelled 100 spot order\(s\)/i);
    expect(error.message).toMatch(/unreachable/i);
    // Must not read as "nothing matched".
    expect(error.message).not.toMatch(/cancelled 0 spot order/i);
  });

  it("warns that an unfiltered cancel-all reaches other markets too", async () => {
    resetMocks();
    mockOpenOrderBook(Array.from({ length: 11_000 }, (_, i) => order(String(i), ETH_ADDR)));
    mockCancelsExcept(new Map());

    const error = await cancelAllSpotOrders(
      { symbol: "APT/USDC" },
      {},
      { sleep: () => Promise.resolve() },
    ).catch((e: Error) => e);

    expect(error.message).toMatch(/every other market/i);
  });

  it("still treats a window of its own cancelled orders as indexer lag, not unreachable", async () => {
    resetMocks();
    const book = mockOpenOrderBook(
      Array.from({ length: 10_501 }, (_, i) => order(String(i))),
      { staleReads: 1 },
    );
    mockCancelsExcept(book);
    const sleep = vi.fn(() => Promise.resolve());

    const result = await cancelAllSpotOrders({}, {}, { sleep });

    expect(sleep).toHaveBeenCalled();
    expect(result).toEqual({ cancelled: 10_501, failed: 0, total: 10_501 });
  });
});

describe("spot read actions", () => {
  // The API serves these in raw chain units. Reporting min_size as
  // 1_000_000_000 invites a caller to submit it as an order size, which is
  // 100 million times the real 10-unit minimum.
  it("getSpotMarkets normalizes constraints to order units and keeps the raw values", async () => {
    resetMocks();
    const { markets } = await getSpotMarkets();

    expect(mockReadDex.markets.getAllSpot).toHaveBeenCalled();
    expect(markets).toEqual([
      {
        name: "APT/USDC",
        address: APT_ADDR,
        tickSize: 0.0001,
        minSize: 10,
        lotSize: 0.1,
        rawTickSize: 100,
        rawMinSize: 1_000_000_000,
        rawLotSize: 10_000_000,
        baseDecimals: 8,
        quoteDecimals: 6,
        mode: "Open",
      },
    ]);
  });

  it("getSpotMarkets reports a minSize an order can actually be checked against", async () => {
    resetMocks();
    const { markets } = await getSpotMarkets();
    const market = markets[0];

    // A 10-unit order is exactly the minimum; 9 is below it. Against the raw
    // value both would look absurdly small.
    expect(market.minSize).toBe(10);
    expect(9 < market.minSize).toBe(true);
    expect(10 >= market.minSize).toBe(true);
  });

  it("getSpotPrice reports the asset context and derives the 24h change", async () => {
    resetMocks();
    const price = await getSpotPrice({ symbol: "APT/USDC" });

    expect(price).toMatchObject({
      symbol: "APT/USDC",
      lastPrice: 4,
      midPrice: 4.5,
      high24h: 6,
      low24h: 3,
      volume24hBase: 100,
      volume24hQuote: 450,
    });
    // (4 - 5) / 5 = -20%
    expect(price.change24hPct).toBeCloseTo(-20, 9);
  });

  it("getSpotPrice reports a null 24h change when there is no baseline", async () => {
    resetMocks();
    mockReadDex.spotAssetContexts.getAll.mockResolvedValueOnce([
      { ...spotAssetContext, prev_day_price: null },
    ]);

    expect((await getSpotPrice({ symbol: "APT/USDC" })).change24hPct).toBeNull();
  });

  it("getSpotPrice rejects an unknown spot market", async () => {
    resetMocks();
    await expect(getSpotPrice({ symbol: "BTC/USD" })).rejects.toThrow(
      'Spot market "BTC/USD" not found',
    );
  });

  it("getSpotOrderbook subscribes to the spot market address and trims to the depth", async () => {
    resetMocks();
    nextDepthSnapshot = {
      best_bid: 4,
      best_ask: 5,
      bids: [
        { price: 4, size: 1 },
        { price: 3.9, size: 2 },
      ],
      asks: [
        { price: 5, size: 1 },
        { price: 5.1, size: 2 },
      ],
    };

    const book = await getSpotOrderbook({ symbol: "APT/USDC", depth: 1 });

    expect(mockReadDex.marketDepth.subscribeByAddr).toHaveBeenCalledWith(
      APT_ADDR,
      1,
      expect.any(Function),
    );
    expect(book.bids).toEqual([{ price: 4, size: 1 }]);
    expect(book.asks).toEqual([{ price: 5, size: 1 }]);
    expect(book.spread).toBe(1);
  });

  it("getSpotOrders requests open orders scoped to spot", async () => {
    resetMocks();
    mockReadDex.userOpenOrders.getByAddr.mockResolvedValue({ items: [{ order_id: "1" }] });

    const { orders } = await getSpotOrders();

    expect(mockReadDex.userOpenOrders.getByAddr).toHaveBeenCalledWith({
      subAddr: "0xsubaccount",
      assetType: "spot",
      limit: 500,
      offset: 0,
    });
    expect(orders).toHaveLength(1);
  });

  it("getSpotOrders flags truncation instead of implying it returned everything", async () => {
    resetMocks();
    mockReadDex.userOpenOrders.getByAddr.mockResolvedValue({
      items: Array.from({ length: 500 }, (_, i) => ({ order_id: String(i) })),
    });

    const { orders, truncated } = await getSpotOrders();

    expect(truncated).toBe(true);
    expect(orders).toHaveLength(10_500);
  });

  it("getSpotOrders reports truncated false when the account fits in the window", async () => {
    resetMocks();
    mockReadDex.userOpenOrders.getByAddr.mockResolvedValue({ items: [{ order_id: "1" }] });

    expect((await getSpotOrders()).truncated).toBe(false);
  });

  // `total_count` is the size of the API's over-fetched window
  // (`clamp((limit + offset) * 2, ...)`), not the true number of open orders,
  // so it must never decide when to stop paging. A full page always warrants
  // another request; only a short page or the offset ceiling ends the sweep.
  it("keeps paging past a full page whose total_count understates the book", async () => {
    resetMocks();
    mockReadDex.userOpenOrders.getByAddr
      .mockResolvedValueOnce({
        items: Array.from({ length: 500 }, (_, i) => ({ order_id: String(i) })),
        total_count: 500,
      })
      .mockResolvedValueOnce({
        items: Array.from({ length: 300 }, (_, i) => ({ order_id: String(500 + i) })),
        total_count: 500,
      });

    const { orders, truncated } = await getSpotOrders();

    expect(mockReadDex.userOpenOrders.getByAddr).toHaveBeenCalledTimes(2);
    expect(orders).toHaveLength(800);
    expect(truncated).toBe(false);
  });

  it("getSpotOrders returns orders past the first page", async () => {
    resetMocks();
    mockReadDex.userOpenOrders.getByAddr
      .mockResolvedValueOnce({
        items: Array.from({ length: 500 }, (_, i) => ({ order_id: String(i) })),
      })
      .mockResolvedValueOnce({ items: [{ order_id: "500" }] });

    const { orders } = await getSpotOrders();

    expect(orders).toHaveLength(501);
    expect(orders[500]).toMatchObject({ order_id: "500" });
  });

  it("getSpotTradeHistory and getSpotOrderHistory pass assetType spot with the limit", async () => {
    resetMocks();
    mockReadDex.userTradeHistory.getByAddr.mockResolvedValue({ items: [] });
    mockReadDex.userOrderHistory.getByAddr.mockResolvedValue({ items: [] });

    await getSpotTradeHistory({ limit: 5 });
    await getSpotOrderHistory({ limit: 7 });

    expect(mockReadDex.userTradeHistory.getByAddr).toHaveBeenCalledWith({
      subAddr: "0xsubaccount",
      limit: 5,
      assetType: "spot",
    });
    expect(mockReadDex.userOrderHistory.getByAddr).toHaveBeenCalledWith({
      subAddr: "0xsubaccount",
      limit: 7,
      assetType: "spot",
    });
  });

  it("getSpotBalances reports positions, reservations and metrics", async () => {
    resetMocks();
    mockReadDex.accountOverview.getByAddr.mockResolvedValue({
      spot: {
        positions: [
          {
            asset_addr: "0xbase",
            asset_symbol: "APT",
            amount: 10,
            usd_value: 45,
            entry_notional_usd: 40,
            unrealized_pnl_usd: 5,
          },
        ],
        total_usd: 45,
        total_unrealized_pnl_usd: 5,
        in_flight_orders: [
          {
            market_addr: APT_ADDR,
            order_id: "1",
            is_bid: true,
            reserved_asset: "0xquote",
            reserved_amount: 20,
            reserved_usd_value: 20,
          },
        ],
        metrics: {
          cumulative_volume_usd: 100,
          cumulative_taker_fees_usd: 1,
          cumulative_maker_fees_usd: 0,
          cumulative_realized_pnl_usd: 3,
        },
      },
    });

    const balances = await getSpotBalances();

    expect(balances.subaccountAddress).toBe("0xsubaccount");
    expect(balances.totalUsd).toBe(45);
    expect(balances.unrealizedPnlUsd).toBe(5);
    expect(balances.positions).toHaveLength(1);
    expect(balances.inFlightOrders).toHaveLength(1);
    expect(balances.metrics).toMatchObject({ cumulativeVolumeUsd: 100 });
  });

  it("getSpotBalances returns an empty view when the account has no spot enrichment", async () => {
    resetMocks();
    mockReadDex.accountOverview.getByAddr.mockResolvedValue({ spot: null });

    const balances = await getSpotBalances();

    expect(balances).toMatchObject({
      subaccountAddress: "0xsubaccount",
      totalUsd: 0,
      positions: [],
      inFlightOrders: [],
      metrics: null,
    });
  });
});
