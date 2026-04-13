import { z } from "zod";

import { createWriteDex, DexOptions, resolveSubaccountAddress } from "../services/dex-factory.js";

export const CancelOrderSchema = z.object({
  orderId: z.string().describe("Order ID to cancel"),
  symbol: z.string().describe("Market symbol"),
});

export type CancelOrderParams = z.infer<typeof CancelOrderSchema>;

export async function cancelOrder(params: CancelOrderParams, dexOptions: DexOptions = {}) {
  const writeDex = await createWriteDex(dexOptions);

  const result = await writeDex.cancelOrder({
    orderId: params.orderId,
    marketName: params.symbol,
    subaccountAddr: resolveSubaccountAddress(dexOptions),
  });

  return { success: true as const, transactionHash: result.hash };
}
