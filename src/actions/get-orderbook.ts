import { z } from "zod";

import { createReadDex, DexOptions } from "../services/dex-factory.js";

export const GetOrderbookSchema = z.object({
  symbol: z.string().describe("Market symbol (e.g., BTC/USD)"),
  depth: z.number().int().min(1).max(20).optional().default(10).describe("Number of levels"),
});

export type GetOrderbookParams = z.infer<typeof GetOrderbookSchema>;

export async function getOrderbook(params: GetOrderbookParams, dexOptions: DexOptions = {}) {
  const readDex = createReadDex(dexOptions);

  // Subscribe, capture the first snapshot, then unsubscribe
  const snapshot = await new Promise<{
    bids: Array<{ price: number; size: number }>;
    asks: Array<{ price: number; size: number }>;
    bestBid: number | null;
    bestAsk: number | null;
  }>((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error(`Timed out waiting for orderbook data for ${params.symbol}`));
    }, 10_000);

    const unsubscribe = readDex.marketDepth.subscribeByName(params.symbol, 1, (data) => {
      clearTimeout(timeout);
      unsubscribe();
      resolve({
        bids: data.bids.slice(0, params.depth),
        asks: data.asks.slice(0, params.depth),
        bestBid: data.best_bid ?? null,
        bestAsk: data.best_ask ?? null,
      });
    });
  });

  const spread =
    snapshot.bestAsk != null && snapshot.bestBid != null
      ? snapshot.bestAsk - snapshot.bestBid
      : null;
  const spreadPercent =
    spread != null && snapshot.bestAsk != null && snapshot.bestAsk > 0
      ? (spread / snapshot.bestAsk) * 100
      : null;

  return {
    symbol: params.symbol,
    ...snapshot,
    spread,
    spreadPercent,
  };
}
