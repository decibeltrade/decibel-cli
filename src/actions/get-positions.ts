import { DecibelReadDex } from "@decibeltrade/sdk";

import { createReadDex, DexOptions, resolveSubaccountAddress } from "../services/dex-factory.js";

/**
 * Market address (lowercased) to symbol, for rows that carry only an address.
 *
 * Covers both products in one lookup — perp and spot derive different addresses
 * from the same name, so they cannot collide — which lets every table resolve
 * its market column the same way. Names are stable, so a caller rendering a
 * stream can build this once.
 */
export async function fetchMarketNames(readDex: DecibelReadDex): Promise<Map<string, string>> {
  const markets = await readDex.markets.getAll({ includeSpot: true });
  return new Map(markets.map((m) => [m.market_addr.toLowerCase(), m.market_name]));
}

/**
 * Open positions, enriched with the fields `/account_positions` does not carry.
 *
 * That endpoint identifies a market only by address and returns no mark price,
 * so a position on its own cannot say which market it is in or what it is
 * currently worth. Both are resolved here from bulk endpoints, fetched
 * alongside the positions rather than after them.
 *
 * `marketName`, `markPrice` and `unrealizedPnl` are null when the market is
 * absent from the market or price list — a missing price is not a flat
 * position, and rendering it as 0 would read as one.
 */
export async function getPositions(dexOptions: DexOptions = {}) {
  const subaccountAddr = resolveSubaccountAddress(dexOptions);
  const readDex = createReadDex(dexOptions);

  const [rawPositions, nameByAddr, prices] = await Promise.all([
    readDex.userPositions.getByAddr({ subAddr: subaccountAddr, limit: 100 }),
    fetchMarketNames(readDex),
    readDex.marketPrices.getAll(),
  ]);

  const markByAddr = new Map(prices.map((p) => [p.market.toLowerCase(), p.mark_px]));

  const positions = rawPositions.map((position) => {
    const key = position.market.toLowerCase();
    const markPrice = markByAddr.get(key) ?? null;

    return {
      ...position,
      marketName: nameByAddr.get(key) ?? null,
      markPrice,
      // A short carries a negative size, so one expression covers both sides.
      unrealizedPnl: markPrice === null ? null : position.size * (markPrice - position.entry_price),
    };
  });

  return { positions };
}
