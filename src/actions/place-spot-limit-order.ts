import { z } from "zod";

import {
  createReadDex,
  createWriteDex,
  DexOptions,
  resolveSubaccountAddress,
} from "../services/dex-factory.js";
import { findSpotMarket, toSpotChainPrice } from "./spot-utils.js";
import { parseSide, parseTimeInForce, toChainSize } from "./utils.js";

export const PlaceSpotLimitOrderSchema = z.object({
  side: z.enum(["buy", "sell"]).describe("Order side"),
  size: z.number().positive().describe("Order size, in base-asset units"),
  symbol: z.string().describe("Spot market symbol (e.g., APT/USDC)"),
  price: z.number().positive().describe("Limit price, in quote-asset units"),
  timeInForce: z
    .enum(["gtc", "post-only", "ioc"])
    .optional()
    .default("gtc")
    .describe("Time in force"),
});

export type PlaceSpotLimitOrderParams = z.infer<typeof PlaceSpotLimitOrderSchema>;

/**
 * Spot orders carry no reduce-only flag, TP/SL or client order id on chain —
 * the entry function takes price, size, side, time-in-force and the optional
 * builder pair only.
 *
 * The price is snapped to the tick side-safely (buys down, sells up) so the
 * price the caller named is never crossed, which the perp path's nearest-tick
 * rounding would break. `tickSize` is still passed through — the SDK applies
 * the same rounding, and it is idempotent.
 */
export async function placeSpotLimitOrder(
  params: PlaceSpotLimitOrderParams,
  dexOptions: DexOptions = {},
) {
  const isBuy = parseSide(params.side);
  const timeInForce = parseTimeInForce(params.timeInForce);

  const readDex = createReadDex(dexOptions);
  const market = await findSpotMarket(readDex, params.symbol);

  const chainPrice = toSpotChainPrice(params.price, market, isBuy);
  if (chainPrice <= 0) {
    throw new Error(
      `Price ${params.price} is below the smallest tick on ${market.market_name} and rounds to zero.`,
    );
  }

  const writeDex = await createWriteDex(dexOptions);
  return await writeDex.placeSpotOrder({
    marketName: market.market_name,
    price: chainPrice,
    size: toChainSize(params.size, market.sz_decimals),
    isBuy,
    timeInForce,
    tickSize: market.tick_size,
    subaccountAddr: resolveSubaccountAddress(dexOptions),
  });
}
