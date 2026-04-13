import { TimeInForce } from "@decibeltrade/sdk";
import { z } from "zod";

import {
  createReadDex,
  createWriteDex,
  DexOptions,
  resolveSubaccountAddress,
} from "../services/dex-factory.js";
import { findMarket, parseSide, roundToTick, toChainPrice, toChainSize } from "./utils.js";

export const PlaceMarketOrderSchema = z.object({
  side: z.enum(["buy", "sell", "long", "short"]).describe("Order side"),
  size: z.number().positive().describe("Order size"),
  symbol: z.string().describe("Market symbol (e.g., BTC/USD)"),
  slippage: z.number().min(0).max(100).optional().default(1).describe("Slippage percentage"),
  reduceOnly: z.boolean().optional().default(false).describe("Reduce-only order"),
  clientOrderId: z.string().optional().describe("Client order ID for tracking"),
});

export type PlaceMarketOrderParams = z.infer<typeof PlaceMarketOrderSchema>;

export async function placeMarketOrder(
  params: PlaceMarketOrderParams,
  dexOptions: DexOptions = {},
) {
  const isBuy = parseSide(params.side);
  const slippage = params.slippage / 100;

  const readDex = createReadDex(dexOptions);
  const market = await findMarket(readDex, params.symbol);

  const prices = await readDex.marketPrices.getByName({ marketName: params.symbol });
  const currentPrice = prices[0]?.mark_px;
  if (!currentPrice) {
    throw new Error(`Could not get current price for ${params.symbol}`);
  }

  const limitPrice = isBuy ? currentPrice * (1 + slippage) : currentPrice * (1 - slippage);
  const roundedPrice = roundToTick(limitPrice, market.tick_size, market.px_decimals);
  const chainPrice = toChainPrice(roundedPrice, market.px_decimals);
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
    tickSize: market.tick_size,
    subaccountAddr: resolveSubaccountAddress(dexOptions),
  });
}
