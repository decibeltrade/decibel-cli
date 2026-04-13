import { TimeInForce } from "@decibeltrade/sdk";
import { z } from "zod";

import {
  createReadDex,
  createWriteDex,
  DexOptions,
  resolveSubaccountAddress,
} from "../services/dex-factory.js";
import { findMarket, roundToTick, toChainPrice, toChainSize } from "./utils.js";

export const ClosePositionSchema = z.object({
  symbol: z.string().describe("Market symbol (e.g., BTC/USD)"),
  slippage: z.number().min(0).max(100).optional().default(1).describe("Slippage percentage"),
  size: z.number().positive().optional().describe("Partial close size (default: full position)"),
});

export type ClosePositionParams = z.infer<typeof ClosePositionSchema>;

export interface ClosePositionResult {
  isLong: boolean;
  closeSize: number;
  limitPrice: number;
  orderResult: Awaited<ReturnType<import("@decibeltrade/sdk").DecibelWriteDex["placeOrder"]>>;
}

export async function closePosition(
  params: ClosePositionParams,
  dexOptions: DexOptions = {},
): Promise<ClosePositionResult> {
  const subaccountAddr = resolveSubaccountAddress(dexOptions);
  const readDex = createReadDex(dexOptions);

  const market = await findMarket(readDex, params.symbol);

  const positions = await readDex.userPositions.getByAddr({
    subAddr: subaccountAddr,
    limit: 100,
  });

  const position = positions.find(
    (p) => p.market.toLowerCase() === market.market_addr.toLowerCase(),
  );

  if (!position || position.size === 0) {
    throw new Error(`No open position found for ${params.symbol}`);
  }

  const positionSize = Math.abs(position.size);
  const isLong = position.size > 0;
  const closeSize = params.size ?? positionSize;

  if (closeSize > positionSize) {
    throw new Error(`Close size ${closeSize} exceeds position size ${positionSize}`);
  }

  const prices = await readDex.marketPrices.getByName({ marketName: params.symbol });
  const currentPrice = prices[0]?.mark_px;
  if (!currentPrice) {
    throw new Error(`Could not get current price for ${params.symbol}`);
  }

  const slippage = params.slippage / 100;
  const isBuy = !isLong;
  const limitPrice = isBuy ? currentPrice * (1 + slippage) : currentPrice * (1 - slippage);

  const roundedPrice = roundToTick(limitPrice, market.tick_size, market.px_decimals);
  const chainPrice = toChainPrice(roundedPrice, market.px_decimals);
  const chainSize = toChainSize(closeSize, market.sz_decimals);

  const writeDex = await createWriteDex(dexOptions);
  const orderResult = await writeDex.placeOrder({
    marketName: params.symbol,
    price: chainPrice,
    size: chainSize,
    isBuy,
    timeInForce: TimeInForce.ImmediateOrCancel,
    isReduceOnly: true,
    tickSize: market.tick_size,
    subaccountAddr: resolveSubaccountAddress(dexOptions),
  });

  return { isLong, closeSize, limitPrice, orderResult };
}
