import { z } from "zod";

import { createReadDex, DexOptions } from "../services/dex-factory.js";
import { findSpotAssetContext, findSpotMarket, spotChangePct24h } from "./spot-utils.js";

export const GetSpotPriceSchema = z.object({
  symbol: z.string().describe("Spot market symbol (e.g., APT/USDC)"),
});

export type GetSpotPriceParams = z.infer<typeof GetSpotPriceSchema>;

/**
 * Spot has no funding, open interest or oracle/mark price — the 24h stats
 * snapshot from `/spot/asset_contexts` is the whole price surface.
 *
 * Nulls are meaningful: `midPrice` is null unless both book sides have resting
 * liquidity, and `lastPrice`/`high24h`/`low24h` are null without a trade in
 * the last 24h.
 */
export async function getSpotPrice(params: GetSpotPriceParams, dexOptions: DexOptions = {}) {
  const readDex = createReadDex(dexOptions);
  const market = await findSpotMarket(readDex, params.symbol);
  const context = await findSpotAssetContext(readDex, market.market_addr);

  if (!context) {
    throw new Error(`No price data found for spot market "${params.symbol}"`);
  }

  return {
    symbol: market.market_name,
    marketAddress: market.market_addr,
    lastPrice: context.last_price,
    midPrice: context.mid,
    prevDayPrice: context.prev_day_price,
    change24hPct: spotChangePct24h(context),
    high24h: context.high_24h,
    low24h: context.low_24h,
    volume24hBase: context.volume_24h_base,
    volume24hQuote: context.volume_24h_quote,
    baseAssetAddress: context.base_asset_addr,
    quoteAssetAddress: context.quote_asset_addr,
  };
}
