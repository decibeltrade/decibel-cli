import { TimeInForce } from "@decibeltrade/sdk";
import { z } from "zod";

import {
  createReadDex,
  createWriteDex,
  DexOptions,
  resolveSubaccountAddress,
} from "../services/dex-factory.js";
import { findSpotMarket, getSpotReferencePrice, toSpotChainPrice } from "./spot-utils.js";
import { parseSide, toChainSize } from "./utils.js";

export const PlaceSpotMarketOrderSchema = z
  .object({
    side: z.enum(["buy", "sell"]).describe("Order side"),
    size: z.number().positive().describe("Order size, in base-asset units"),
    symbol: z.string().describe("Spot market symbol (e.g., APT/USDC)"),
    slippage: z.number().min(0).max(100).optional().default(1).describe("Slippage percentage"),
  })
  // A 100% sell slippage prices the floor at zero, which the contract always
  // rejects — catch it here rather than at submission. The same slippage on a
  // buy just caps at twice the mid, which is legal if expensive.
  .refine((v) => !(v.side === "sell" && v.slippage >= 100), {
    path: ["slippage"],
    message: "A sell slippage of 100% prices the order at zero. Use a slippage below 100.",
  });

export type PlaceSpotMarketOrderParams = z.infer<typeof PlaceSpotMarketOrderSchema>;

/**
 * There is no market order on chain for spot: this sends an IOC limit at the
 * slippage cap, the same shape the web order form submits.
 *
 * The cap is also the price a bid's escrow is reserved at, so a buy withholds
 * `size * cap` quote — size the order against that, not the reference price.
 */
export async function placeSpotMarketOrder(
  params: PlaceSpotMarketOrderParams,
  dexOptions: DexOptions = {},
) {
  const isBuy = parseSide(params.side);
  const slippage = params.slippage / 100;

  const readDex = createReadDex(dexOptions);
  const market = await findSpotMarket(readDex, params.symbol);
  const referencePrice = await getSpotReferencePrice(readDex, market);

  const cap = isBuy ? referencePrice * (1 + slippage) : referencePrice * (1 - slippage);

  // Snap to the tick here rather than reporting the pre-rounding cap: the SDK
  // rounds side-safely on the way to chain, so an unrounded cap would be off
  // by up to a tick from the price the order is really submitted (and escrowed)
  // at. Rounding is idempotent, so passing `tickSize` through changes nothing.
  const chainLimitPrice = toSpotChainPrice(cap, market, isBuy);
  // Reachable below the 100% guard: a sub-tick reference price with heavy
  // slippage still rounds away to nothing, and the contract requires a
  // positive price. Fail before spending a signature on a certain abort.
  if (chainLimitPrice <= 0) {
    throw new Error(
      `A ${params.slippage}% slippage on a reference price of ${referencePrice} produces an invalid spot limit price of 0. Lower the slippage or place a limit order.`,
    );
  }

  const writeDex = await createWriteDex(dexOptions);
  const result = await writeDex.placeSpotOrder({
    marketName: market.market_name,
    price: chainLimitPrice,
    size: toChainSize(params.size, market.sz_decimals),
    isBuy,
    timeInForce: TimeInForce.ImmediateOrCancel,
    tickSize: market.tick_size,
    subaccountAddr: resolveSubaccountAddress(dexOptions),
  });

  return {
    ...result,
    referencePrice,
    /** The tick-aligned price the order was submitted at, in quote-asset units. */
    limitPrice: chainLimitPrice / 10 ** market.px_decimals,
  };
}
