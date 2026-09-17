import { z } from "zod";

import {
  createReadDex,
  createWriteDex,
  DexOptions,
  resolveSubaccountAddress,
} from "../services/dex-factory.js";
import { findSpotMarketName } from "./spot-utils.js";

export const CancelSpotOrderSchema = z.object({
  orderId: z.string().describe("Spot order ID to cancel"),
  symbol: z.string().describe("Spot market symbol (e.g., APT/USDC)"),
});

export type CancelSpotOrderParams = z.infer<typeof CancelSpotOrderSchema>;

/**
 * The market list is consulted only to canonicalise the symbol's casing — the
 * SDK derives the on-chain address from the name itself, so the cancel needs
 * nothing else from it. That lookup is therefore best-effort: this is the only
 * way to reach an order queued behind a CBS withdrawal, and one left live
 * because `/markets` was briefly unavailable, or because the market was
 * delisted while the order still rested, executes when the queue drains.
 * Refusing to sign would be the worse failure.
 *
 * `marketNameVerified` is false when the symbol went through unresolved. The
 * symbol is then used as typed, so a casing mismatch surfaces as an on-chain
 * abort rather than a silent cancel of nothing.
 */
export async function cancelSpotOrder(params: CancelSpotOrderParams, dexOptions: DexOptions = {}) {
  let marketName = params.symbol;
  let marketNameVerified = false;

  try {
    const readDex = createReadDex(dexOptions);
    // Best-effort: an unresolved symbol still cancels, as typed.
    marketName = await findSpotMarketName(readDex, params.symbol);
    marketNameVerified = true;
  } catch {
    // Unknown symbol or an unreachable market list — neither is a reason to
    // leave a live order standing.
  }

  const writeDex = await createWriteDex(dexOptions);
  const result = await writeDex.cancelSpotOrder({
    orderId: params.orderId,
    marketName,
    subaccountAddr: resolveSubaccountAddress(dexOptions),
  });

  return { success: true as const, transactionHash: result.hash, marketNameVerified };
}
