import { TimeInForce } from "@decibeltrade/sdk";
import { z } from "zod";

import {
  createReadDex,
  createWriteDex,
  DexOptions,
  resolveSubaccountAddress,
} from "../services/dex-factory.js";
import { findMarket, parseSide, roundToTick, toChainPrice, toChainSize } from "./utils.js";

export const PlaceStopMarketOrderSchema = z.object({
  side: z.enum(["buy", "sell", "long", "short"]).describe("Order side"),
  size: z.number().positive().describe("Order size"),
  symbol: z.string().describe("Market symbol (e.g., BTC/USD)"),
  stopPrice: z.number().positive().describe("Stop trigger price"),
  slippage: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .default(1)
    .describe("Slippage percentage from stop price"),
  reduceOnly: z.boolean().optional().default(false).describe("Reduce-only order"),
  clientOrderId: z.string().optional().describe("Client order ID for tracking"),
});

export type PlaceStopMarketOrderParams = z.infer<typeof PlaceStopMarketOrderSchema>;

export async function placeStopMarketOrder(
  params: PlaceStopMarketOrderParams,
  dexOptions: DexOptions = {},
) {
  const isBuy = parseSide(params.side);
  const slippage = params.slippage / 100;

  const readDex = createReadDex(dexOptions);
  const market = await findMarket(readDex, params.symbol);

  // Limit price with slippage applied to the stop price to ensure fill after trigger
  const limitPrice = isBuy ? params.stopPrice * (1 + slippage) : params.stopPrice * (1 - slippage);

  const roundedPrice = roundToTick(limitPrice, market.tick_size, market.px_decimals);
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
    timeInForce: TimeInForce.ImmediateOrCancel,
    isReduceOnly: params.reduceOnly,
    clientOrderId: params.clientOrderId,
    stopPrice: chainStopPrice,
    tickSize: market.tick_size,
    subaccountAddr: resolveSubaccountAddress(dexOptions),
  });
}
