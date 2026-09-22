import { TimeInForce } from "@decibeltrade/sdk";
import { z } from "zod";

import {
  createReadDex,
  createWriteDex,
  DexOptions,
  resolveSubaccountAddress,
} from "../services/dex-factory.js";
import {
  assertCredibleSpotBook,
  executableLimitPrice,
  findSpotMarket,
  getSpotReferenceQuote,
  toSpotChainPrice,
} from "./spot-utils.js";
import { parseSide, toChainSize } from "./utils.js";

/**
 * Headroom over the worst level a fill actually needs, so ordinary book
 * movement between the snapshot and execution still fills.
 */
const DEPTH_CAP_BUFFER_PCT = 0.005;

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
 *
 * Two things bound that cap, because the slippage percentage alone cannot.
 * Slippage is measured from the reference price, and on spot the reference
 * price comes from the book, so an attacker who moves the book moves the cap
 * with it and the percentage constrains nothing. {@link assertCredibleSpotBook}
 * is what makes the reference worth anchoring to.
 *
 * That gate is best-effort and cannot be otherwise from here. It reads a
 * snapshot, while the IOC it authorizes executes on chain later, so liquidity
 * that satisfied it can be pulled before the fill — leaving an attacker to
 * risk the exposure the gate demands only for the length of that window rather
 * than for the trade. Ordering below keeps the window to local arithmetic, but
 * closing it needs the invariant enforced at execution time, which the spot
 * contract does not offer.
 */
export async function placeSpotMarketOrder(
  params: PlaceSpotMarketOrderParams,
  dexOptions: DexOptions = {},
) {
  const isBuy = parseSide(params.side);
  const slippage = params.slippage / 100;

  const readDex = createReadDex(dexOptions);

  // Resolved before the book is read, not after the gate passes: this decrypts
  // the signing key behind a deliberately slow KDF, and every millisecond of
  // that sits between vetting the book and committing to it.
  const writeDex = await createWriteDex(dexOptions);

  const market = await findSpotMarket(readDex, params.symbol);
  const { price: referencePrice, snapshot } = await getSpotReferenceQuote(readDex, market);

  // A buy escrows `size * cap`, so that — not the reference price — is what the
  // book has to be able to defend. A sell's floor sits below the reference
  // price, and sizing on it there would ask for less than the trade is worth.
  assertCredibleSpotBook(snapshot, {
    orderNotional: params.size * (isBuy ? referencePrice * (1 + slippage) : referencePrice),
    isBuy,
    marketName: market.market_name,
  });

  const slippageCap = isBuy ? referencePrice * (1 + slippage) : referencePrice * (1 - slippage);

  // Headroom above what the book requires is headroom an attacker keeps.
  const executable = executableLimitPrice(snapshot, params.size, isBuy);
  const depthCap =
    executable == null
      ? null
      : isBuy
        ? executable * (1 + DEPTH_CAP_BUFFER_PCT)
        : executable * (1 - DEPTH_CAP_BUFFER_PCT);

  const cap =
    depthCap == null
      ? slippageCap
      : isBuy
        ? Math.min(slippageCap, depthCap)
        : Math.max(slippageCap, depthCap);

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
