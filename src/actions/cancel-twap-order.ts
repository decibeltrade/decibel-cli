import { z } from "zod";

import {
  createReadDex,
  createWriteDex,
  DexOptions,
  resolveSubaccountAddress,
} from "../services/dex-factory.js";
import { findMarket } from "./utils.js";

export const CancelTwapOrderSchema = z.object({
  orderId: z.string().describe("TWAP order ID to cancel"),
  symbol: z.string().describe("Market symbol"),
});

export type CancelTwapOrderParams = z.infer<typeof CancelTwapOrderSchema>;

export async function cancelTwapOrder(params: CancelTwapOrderParams, dexOptions: DexOptions = {}) {
  const readDex = createReadDex(dexOptions);
  const market = await findMarket(readDex, params.symbol);

  const writeDex = await createWriteDex(dexOptions);
  const result = await writeDex.cancelTwapOrder({
    orderId: params.orderId,
    marketAddr: market.market_addr,
    subaccountAddr: resolveSubaccountAddress(dexOptions),
  });

  return { success: true as const, transactionHash: result.hash };
}
