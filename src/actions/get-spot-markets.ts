import { createReadDex, DexOptions } from "../services/dex-factory.js";

/**
 * Spot rows reuse the perp market shape with different semantics:
 * `sz_decimals` is the base-asset decimals and `px_decimals` the quote-asset
 * decimals, and the perp-only fields (max leverage, open interest) are zeroed.
 *
 * The API serves the size and price constraints in raw chain units, which are
 * 8-10 orders of magnitude away from the units orders are placed in — a
 * `min_size` of 1_000_000_000 on an 8-decimal base asset is a 10-unit minimum.
 * Both forms are returned: the normalized values are what a caller compares an
 * order against, the `raw*` values are what the on-chain entry function takes.
 */
export async function getSpotMarkets(dexOptions: DexOptions = {}) {
  const readDex = createReadDex(dexOptions);
  const markets = await readDex.markets.getAllSpot();

  return {
    markets: markets.map((m) => ({
      name: m.market_name,
      address: m.market_addr,
      /** Minimum price increment, in quote-asset units. */
      tickSize: m.tick_size / 10 ** m.px_decimals,
      /** Smallest order, in base-asset units. */
      minSize: m.min_size / 10 ** m.sz_decimals,
      /** Order size increment, in base-asset units. */
      lotSize: m.lot_size / 10 ** m.sz_decimals,
      rawTickSize: m.tick_size,
      rawMinSize: m.min_size,
      rawLotSize: m.lot_size,
      baseDecimals: m.sz_decimals,
      quoteDecimals: m.px_decimals,
      mode: m.mode,
    })),
  };
}
