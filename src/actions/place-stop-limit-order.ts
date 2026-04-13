import { z } from "zod";

import {
  createReadDex,
  createWriteDex,
  DexOptions,
  resolveSubaccountAddress,
} from "../services/dex-factory.js";
import {
  findMarket,
  parseSide,
  parseTimeInForce,
  roundToTick,
  toChainPrice,
  toChainSize,
} from "./utils.js";

export const PlaceStopLimitOrderSchema = z.object({
  side: z.enum(["buy", "sell", "long", "short"]).describe("Order side"),
  size: z.number().positive().describe("Order size"),
  symbol: z.string().describe("Market symbol (e.g., BTC/USD)"),
  price: z.number().positive().describe("Limit price (execution price after trigger)"),
  stopPrice: z.number().positive().describe("Stop trigger price"),
  timeInForce: z
    .enum(["gtc", "post-only", "ioc"])
    .optional()
    .default("gtc")
    .describe("Time in force"),
  reduceOnly: z.boolean().optional().default(false).describe("Reduce-only order"),
  clientOrderId: z.string().optional().describe("Client order ID for tracking"),
});

export type PlaceStopLimitOrderParams = z.infer<typeof PlaceStopLimitOrderSchema>;

export async function placeStopLimitOrder(
  params: PlaceStopLimitOrderParams,
  dexOptions: DexOptions = {},
) {
  const isBuy = parseSide(params.side);
  const timeInForce = parseTimeInForce(params.timeInForce);

  const readDex = createReadDex(dexOptions);
  const market = await findMarket(readDex, params.symbol);

  const roundedPrice = roundToTick(params.price, market.tick_size, market.px_decimals);
  const roundedStopPrice = roundToTick(params.stopPrice, market.tick_size, market.px_decimals);
  const chainPrice = toChainPrice(roundedPrice, market.px_decimals);
  const chainStopPrice = toChainPrice(roundedStopPrice, market.px_decimals);
  const chainSize = toChainSize(params.size, market.sz_decimals);

  const writeDex = await createWriteDex(dexOptions);
  return writeDex.placeOrder({
    marketName: params.symbol,
    price: chainPrice,
    size: chainSize,
    isBuy,
    timeInForce,
    isReduceOnly: params.reduceOnly,
    clientOrderId: params.clientOrderId,
    stopPrice: chainStopPrice,
    tickSize: market.tick_size,
    subaccountAddr: resolveSubaccountAddress(dexOptions),
  });
}
