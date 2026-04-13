import { z } from "zod";

import {
  createReadDex,
  createWriteDex,
  DexOptions,
  resolveSubaccountAddress,
} from "../services/dex-factory.js";
import { findMarket, roundToTick, toChainPrice, toChainSize } from "./utils.js";

export const PlaceTpSlSchema = z
  .object({
    symbol: z.string().describe("Market symbol (e.g., BTC/USD)"),
    tpTriggerPrice: z.number().positive().optional().describe("Take-profit trigger price"),
    tpLimitPrice: z.number().positive().optional().describe("Take-profit limit price"),
    tpSize: z.number().positive().optional().describe("Take-profit size (omit for full position)"),
    slTriggerPrice: z.number().positive().optional().describe("Stop-loss trigger price"),
    slLimitPrice: z.number().positive().optional().describe("Stop-loss limit price"),
    slSize: z.number().positive().optional().describe("Stop-loss size (omit for full position)"),
  })
  .refine((data) => data.tpTriggerPrice !== undefined || data.slTriggerPrice !== undefined, {
    message: "At least one of tpTriggerPrice or slTriggerPrice must be provided",
  });

export type PlaceTpSlParams = z.infer<typeof PlaceTpSlSchema>;

export async function placeTpSl(params: PlaceTpSlParams, dexOptions: DexOptions = {}) {
  const readDex = createReadDex(dexOptions);
  const market = await findMarket(readDex, params.symbol);

  const toPrice = (price: number | undefined) =>
    price !== undefined
      ? toChainPrice(roundToTick(price, market.tick_size, market.px_decimals), market.px_decimals)
      : undefined;

  const toSize = (size: number | undefined) =>
    size !== undefined ? toChainSize(size, market.sz_decimals) : undefined;

  const writeDex = await createWriteDex(dexOptions);
  const result = await writeDex.placeTpSlOrderForPosition({
    marketAddr: market.market_addr,
    tpTriggerPrice: toPrice(params.tpTriggerPrice),
    tpLimitPrice: toPrice(params.tpLimitPrice),
    tpSize: toSize(params.tpSize),
    slTriggerPrice: toPrice(params.slTriggerPrice),
    slLimitPrice: toPrice(params.slLimitPrice),
    slSize: toSize(params.slSize),
    subaccountAddr: resolveSubaccountAddress(dexOptions),
    tickSize: market.tick_size,
  });

  return { success: true as const, transactionHash: result.hash };
}
