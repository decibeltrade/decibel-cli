import { createReadDex, DexOptions } from "../services/dex-factory.js";

/**
 * The API serves the size and price constraints in raw chain units, which are
 * 6-10 orders of magnitude away from the units orders are placed in — a
 * `min_size` of 100_000 on an 8-decimal market is a 0.001 minimum. Both forms
 * are returned: the normalized values are what a caller compares an order
 * against, the `raw*` values are what the on-chain entry function takes.
 */
export async function getMarkets(dexOptions: DexOptions = {}) {
  const readDex = createReadDex(dexOptions);
  const markets = await readDex.markets.getAll();

  return {
    markets: markets.map((m) => ({
      name: m.market_name,
      address: m.market_addr,
      maxLeverage: m.max_leverage,
      /** Minimum price increment, in quote units. */
      tickSize: m.tick_size / 10 ** m.px_decimals,
      /** Smallest order, in base units. */
      minSize: m.min_size / 10 ** m.sz_decimals,
      /** Order size increment, in base units. */
      lotSize: m.lot_size / 10 ** m.sz_decimals,
      rawTickSize: m.tick_size,
      rawMinSize: m.min_size,
      rawLotSize: m.lot_size,
      mode: m.mode,
      sizeDecimals: m.sz_decimals,
      priceDecimals: m.px_decimals,
    })),
  };
}
