import { z } from "zod";

import {
  createReadDex,
  createWriteDex,
  DexOptions,
  resolveSubaccountAddress,
} from "../services/dex-factory.js";
import { findMarket } from "./utils.js";

export const CancelTpSlSchema = z.object({
  orderId: z.string().describe("TP/SL order ID to cancel"),
  symbol: z.string().describe("Market symbol"),
});

export type CancelTpSlParams = z.infer<typeof CancelTpSlSchema>;

export async function cancelTpSl(params: CancelTpSlParams, dexOptions: DexOptions = {}) {
  const readDex = createReadDex(dexOptions);
  const market = await findMarket(readDex, params.symbol);

  const writeDex = await createWriteDex(dexOptions);
  const result = await writeDex.cancelTpSlOrderForPosition({
    marketAddr: market.market_addr,
    orderId: params.orderId,
    subaccountAddr: resolveSubaccountAddress(dexOptions),
  });

  return { success: true as const, transactionHash: result.hash };
}
