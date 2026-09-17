import { z } from "zod";

import { createReadDex, DexOptions } from "../services/dex-factory.js";
import { captureSpotDepthSnapshot, findSpotMarket } from "./spot-utils.js";

export const GetSpotOrderbookSchema = z.object({
  symbol: z.string().describe("Spot market symbol (e.g., APT/USDC)"),
  depth: z.number().int().min(1).max(20).optional().default(10).describe("Number of levels"),
});

export type GetSpotOrderbookParams = z.infer<typeof GetSpotOrderbookSchema>;

const DEPTH_SNAPSHOT_TIMEOUT_MS = 10_000;

export async function getSpotOrderbook(
  params: GetSpotOrderbookParams,
  dexOptions: DexOptions = {},
) {
  const readDex = createReadDex(dexOptions);
  // Resolved to an address first so an unknown symbol fails immediately
  // instead of hanging on a topic that will never publish.
  const market = await findSpotMarket(readDex, params.symbol);

  const snapshot = await captureSpotDepthSnapshot(
    readDex,
    market.market_addr,
    DEPTH_SNAPSHOT_TIMEOUT_MS,
  );

  const spread =
    snapshot.bestAsk != null && snapshot.bestBid != null
      ? snapshot.bestAsk - snapshot.bestBid
      : null;
  const spreadPercent =
    spread != null && snapshot.bestAsk != null && snapshot.bestAsk > 0
      ? (spread / snapshot.bestAsk) * 100
      : null;

  return {
    symbol: market.market_name,
    bids: snapshot.bids.slice(0, params.depth),
    asks: snapshot.asks.slice(0, params.depth),
    bestBid: snapshot.bestBid,
    bestAsk: snapshot.bestAsk,
    spread,
    spreadPercent,
  };
}
