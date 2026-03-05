/**
 * MCP Market Tools
 *
 * Read-only tools for getting market data - prices, orderbook, market list.
 * These don't require authentication and are useful for research/monitoring.
 */

import { z } from "zod";

import { createReadDex, DexOptions } from "../../services/dex-factory.js";

// Tool schemas
export const GetMarketsSchema = z.object({}).describe("Get all available markets");

export const GetPriceSchema = z.object({
  symbol: z.string().describe("Market symbol (e.g., BTC/USD)"),
});

export const GetOrderbookSchema = z.object({
  symbol: z.string().describe("Market symbol"),
  depth: z.number().int().min(1).max(50).optional().default(10).describe("Number of levels"),
});

// Tool implementations
export async function getMarkets(dexOptions: DexOptions = {}) {
  const readDex = createReadDex(dexOptions);
  const markets = await readDex.markets.getAll();

  return {
    markets: markets.map((m) => ({
      name: m.market_name,
      address: m.market_addr,
      maxLeverage: m.max_leverage,
      tickSize: m.tick_size,
      minSize: m.min_size,
      lotSize: m.lot_size,
      mode: m.mode,
      sizeDecimals: m.sz_decimals,
      priceDecimals: m.px_decimals,
    })),
  };
}

export async function getPrice(
  params: z.infer<typeof GetPriceSchema>,
  dexOptions: DexOptions = {},
) {
  const readDex = createReadDex(dexOptions);
  const prices = await readDex.marketPrices.getByName({ marketName: params.symbol });
  const price = prices[0];

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!price) {
    return { error: `No price data for ${params.symbol}` };
  }

  return {
    symbol: params.symbol,
    markPrice: price.mark_px,
    oraclePrice: price.oracle_px,
    fundingRateBps: price.funding_rate_bps,
    openInterest: price.open_interest,
  };
}

// TODO: either reintroduce the /depth endpoint or fully delete this function
// export async function getOrderbook(
//   params: z.infer<typeof GetOrderbookSchema>,
//   dexOptions: DexOptions = {},
// ) {
//   const readDex = createReadDex(dexOptions);
//   const orderbook = await readDex.marketDepth.getByName({
//     marketName: params.symbol,
//     limit: params.depth,
//   });
//
//   // Calculate spread
//   const bestBid = orderbook.bids[0]?.price ?? 0;
//   const bestAsk = orderbook.asks[0]?.price ?? 0;
//   const spread = bestAsk - bestBid;
//   const spreadPct = bestAsk > 0 ? (spread / bestAsk) * 100 : 0;
//
//   return {
//     symbol: params.symbol,
//     bids: orderbook.bids.slice(0, params.depth),
//     asks: orderbook.asks.slice(0, params.depth),
//     spread,
//     spreadPercent: spreadPct,
//   };
// }
