import { z } from "zod";

import {
  createReadDex,
  createWriteDex,
  DexOptions,
  resolveSubaccountAddress,
} from "../services/dex-factory.js";
import { findMarket, parseSide, toChainSize } from "./utils.js";

export const PlaceTwapOrderSchema = z.object({
  side: z.enum(["buy", "sell", "long", "short"]).describe("Order side"),
  size: z.number().positive().describe("Total order size"),
  symbol: z.string().describe("Market symbol (e.g., BTC/USD)"),
  duration: z
    .number()
    .int()
    .min(120, "Duration must be at least 2 minutes (120s)")
    .max(86400, "Duration must be at most 24 hours (86400s)")
    .describe("Total duration in seconds (min 120, max 86400)"),
  frequency: z
    .number()
    .int()
    .min(60, "Frequency must be at least 1 minute (60s)")
    .describe("Execution frequency in seconds (min 60)"),
  reduceOnly: z.boolean().optional().default(false).describe("Reduce-only order"),
  clientOrderId: z.string().optional().describe("Client order ID for tracking"),
});

export type PlaceTwapOrderParams = z.infer<typeof PlaceTwapOrderSchema>;

export async function placeTwapOrder(params: PlaceTwapOrderParams, dexOptions: DexOptions = {}) {
  const isBuy = parseSide(params.side);

  if (params.frequency > params.duration) {
    throw new Error(
      `Frequency (${params.frequency}s) cannot exceed duration (${params.duration}s)`,
    );
  }

  const readDex = createReadDex(dexOptions);
  const market = await findMarket(readDex, params.symbol);

  const chainSize = toChainSize(params.size, market.sz_decimals);

  const writeDex = await createWriteDex(dexOptions);
  return writeDex.placeTwapOrder({
    marketName: params.symbol,
    size: chainSize,
    isBuy,
    isReduceOnly: params.reduceOnly,
    clientOrderId: params.clientOrderId,
    twapFrequencySeconds: params.frequency,
    twapDurationSeconds: params.duration,
    subaccountAddr: resolveSubaccountAddress(dexOptions),
  });
}
