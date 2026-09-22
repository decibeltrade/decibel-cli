import { DecibelReadDex, MarketDepth, SpotAssetContext, SpotMarket } from "@decibeltrade/sdk";
import { describe, expect, it } from "vitest";

import {
  assertCredibleSpotBook,
  executableLimitPrice,
  getSpotReferenceQuote,
  SpotDepthSnapshot,
} from "./spot-utils.js";

const MARKET_ADDR = "0x00000000000000000000000000000000000000000000000000000000000000a1";

const MARKET: SpotMarket = {
  asset_type: "spot",
  market_addr: MARKET_ADDR,
  market_name: "APT/USDC",
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

function snapshot(bids: Level[], asks: Level[]): SpotDepthSnapshot {
  return {
    bids,
    asks,
    bestBid: bids.length > 0 ? bids[0].price : null,
    bestAsk: asks.length > 0 ? asks[0].price : null,
  };
}

/**
 * The shape the finding describes: minimum-sized quotes bracketing an
 * arbitrary price on an illiquid market, with the attacker's real inventory
 * resting on the ask. Fair value is ~10.
 */
const SPOOFED_BOOK = snapshot([{ price: 100, size: 0.01 }], [{ price: 102, size: 50 }]);

const HEALTHY_BOOK = snapshot(
  [
    { price: 4.5, size: 5000 },
    { price: 4.49, size: 5000 },
  ],
  [
    { price: 4.51, size: 5000 },
    { price: 4.52, size: 5000 },
  ],
);

function mockReadDex(depth: MarketDepth | null, contexts: SpotAssetContext[]): DecibelReadDex {
  return {
    marketDepth: {
      subscribeByAddr: (_addr: string, _agg: number, cb: (data: MarketDepth) => void) => {
        if (depth) cb(depth);
        return () => undefined;
      },
    },
    spotAssetContexts: {
      getAll: () => Promise.resolve(contexts),
    },
  } as unknown as DecibelReadDex;
}

function depthPayload(bids: Level[], asks: Level[]): MarketDepth {
  return { market: MARKET_ADDR, bids, asks, unix_ms: 0 };
}

function assetContext(overrides: Partial<SpotAssetContext>): SpotAssetContext {
  return {
    market_addr: MARKET_ADDR,
    name: "APT/USDC",
    ticker_id: "APT_USDC",
    base_asset_addr: "0xb",
    quote_asset_addr: "0xq",
    base_decimals: 8,
    quote_decimals: 6,
    last_price: null,
    mid: null,
    prev_day_price: null,
    volume_24h_base: 0,
    volume_24h_quote: 0,
    high_24h: null,
    low_24h: null,
    timestamp_unix_ms: 0,
    ...overrides,
  };
}

describe("executableLimitPrice", () => {
  it("returns the level that completes the requested buy size", () => {
    const book = snapshot(
      [],
      [
        { price: 100, size: 1 },
        { price: 101, size: 5 },
        { price: 102, size: 100 },
      ],
    );
    expect(executableLimitPrice(book, 4, true)).toBe(101);
  });

  it("returns the level that completes the requested sell size", () => {
    const book = snapshot(
      [
        { price: 100, size: 1 },
        { price: 99, size: 5 },
      ],
      [],
    );
    expect(executableLimitPrice(book, 3, false)).toBe(99);
  });

  // A ladder that runs out is not evidence the book has — the feed truncates
  // at 20 levels.
  it("yields no bound when the visible ladder cannot cover the size", () => {
    const book = snapshot(
      [],
      [
        { price: 100, size: 1 },
        { price: 102, size: 2 },
      ],
    );
    expect(executableLimitPrice(book, 200, true)).toBeNull();
  });

  it("yields no bound at the feed's 20-level ceiling, where truncation hides depth", () => {
    // 20 one-unit asks from 100.10 to 100.29, with real liquidity behind them
    // that the feed never sends.
    const truncated = snapshot(
      [],
      Array.from({ length: 20 }, (_, i) => ({ price: 100.1 + i * 0.01, size: 1 })),
    );
    expect(executableLimitPrice(truncated, 50, true)).toBeNull();
    // The same ladder still bounds a size it genuinely covers.
    expect(executableLimitPrice(truncated, 5, true)).toBeCloseTo(100.14, 10);
  });

  // Float drift can leave a positive residual on a ladder that exactly covers
  // the order.
  it("bounds a ladder that exactly covers the size, despite float drift", () => {
    const book = snapshot(
      [],
      [
        { price: 100, size: 0.007 },
        { price: 101, size: 0.007 },
        { price: 102, size: 0.007 },
      ],
    );
    expect(0.021 - 0.007 - 0.007 - 0.007).toBeGreaterThan(0); // the drift itself
    expect(executableLimitPrice(book, 0.021, true)).toBe(102);
  });

  it("returns null when the consuming side is empty", () => {
    expect(executableLimitPrice(snapshot([{ price: 100, size: 1 }], []), 1, true)).toBeNull();
    expect(executableLimitPrice(null, 1, true)).toBeNull();
  });
});

describe("assertCredibleSpotBook", () => {
  const vet = (book: SpotDepthSnapshot | null, orderNotional: number, isBuy: boolean) =>
    assertCredibleSpotBook(book, { orderNotional, isBuy, marketName: MARKET.market_name });

  it("accepts a tight two-sided book with real notional defending the price", () => {
    expect(() => vet(HEALTHY_BOOK, 450.5, true)).not.toThrow();
    expect(() => vet(HEALTHY_BOOK, 450.5, false)).not.toThrow();
  });

  it("rejects the minimum-size two-sided spoof described in the finding", () => {
    // Defending bids hold $1 against a $1,010 order.
    expect(() => vet(SPOOFED_BOOK, 1010, true)).toThrow(/liquidity|notional|defend/i);
  });

  it("does not let far-from-touch size launder a spoofed quote", () => {
    // A deep bid parked at 0.01 carries real notional but never defends 100.
    const laundered = snapshot(
      [
        { price: 100, size: 0.01 },
        { price: 0.01, size: 1_000_000 },
      ],
      [{ price: 102, size: 50 }],
    );
    expect(() => vet(laundered, 1010, true)).toThrow(/liquidity|notional|defend/i);
  });

  it("rejects a book whose spread is too wide to be a price", () => {
    // Bids are deep and genuine, so only the spread gate can catch this.
    const wide = snapshot([{ price: 1, size: 100_000 }], [{ price: 200, size: 50 }]);
    expect(() => vet(wide, 100, true)).toThrow(/spread/i);
  });

  it("gates a buy on the bid side and a sell on the ask side", () => {
    // Thin bids, deep asks: unsafe to buy off this mid, safe to sell into it.
    const thinBids = snapshot(
      [{ price: 4.5, size: 0.01 }],
      [
        { price: 4.51, size: 5000 },
        { price: 4.52, size: 5000 },
      ],
    );
    expect(() => vet(thinBids, 450, true)).toThrow();
    expect(() => vet(thinBids, 450, false)).not.toThrow();
  });

  // trading-api meters this state on the depth feed, so it does occur.
  it("rejects a crossed book instead of pricing off its midpoint", () => {
    const crossed = snapshot([{ price: 102, size: 5000 }], [{ price: 100, size: 5000 }]);
    expect(() => vet(crossed, 100, true)).toThrow(/crossed|locked/i);
  });

  it("rejects a locked book, which should equally have matched", () => {
    const locked = snapshot([{ price: 100, size: 5000 }], [{ price: 100, size: 5000 }]);
    expect(() => vet(locked, 100, true)).toThrow(/crossed|locked/i);
  });

  it("rejects a one-sided or absent book outright", () => {
    expect(() => vet(snapshot([{ price: 100, size: 10 }], []), 1, true)).toThrow();
    expect(() => vet(null, 1, true)).toThrow();
  });
});

describe("getSpotReferenceQuote", () => {
  it("prices off the depth mid and hands back the book it vetted", async () => {
    const readDex = mockReadDex(depthPayload(HEALTHY_BOOK.bids, HEALTHY_BOOK.asks), []);
    const quote = await getSpotReferenceQuote(readDex, MARKET);

    expect(quote.price).toBeCloseTo(4.505, 10);
    expect(quote.snapshot?.asks).toEqual(HEALTHY_BOOK.asks);
  });

  it("refuses when the only available price is the last trade", async () => {
    const readDex = mockReadDex(depthPayload([], []), [assetContext({ last_price: 42 })]);
    await expect(getSpotReferenceQuote(readDex, MARKET)).rejects.toThrow(/No price source/i);
  });

  it("refuses a one-sided book rather than honouring the lone quote", async () => {
    const readDex = mockReadDex(depthPayload([{ price: 100, size: 1 }], []), [
      assetContext({ last_price: 42 }),
    ]);
    await expect(getSpotReferenceQuote(readDex, MARKET)).rejects.toThrow(/No price source/i);
  });

  it("refuses the asset-context mid, which arrives without a ladder to vet", async () => {
    const readDex = mockReadDex(depthPayload([], []), [assetContext({ mid: 5, last_price: 42 })]);
    await expect(getSpotReferenceQuote(readDex, MARKET)).rejects.toThrow(/No price source/i);
  });
});
