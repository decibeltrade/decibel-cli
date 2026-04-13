import { z } from "zod";

import { createReadDex, DexOptions } from "../services/dex-factory.js";

export const GetPriceSchema = z.object({
  symbol: z.string().describe("Market symbol (e.g., BTC/USD)"),
});

export type GetPriceParams = z.infer<typeof GetPriceSchema>;

export async function getPrice(params: GetPriceParams, dexOptions: DexOptions = {}) {
  const readDex = createReadDex(dexOptions);
  const prices = await readDex.marketPrices.getByName({ marketName: params.symbol });
  const price = prices[0];

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!price) {
    throw new Error(`No price data found for ${params.symbol}`);
  }

  return {
    symbol: params.symbol,
    markPrice: price.mark_px,
    oraclePrice: price.oracle_px,
    fundingRateBps: price.funding_rate_bps,
    openInterest: price.open_interest,
  };
}
