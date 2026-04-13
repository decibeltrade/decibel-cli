import { z } from "zod";

import { createReadDex, DexOptions, resolveSubaccountAddress } from "../services/dex-factory.js";

export const GetTradeHistorySchema = z.object({
  limit: z.number().int().min(1).max(100).optional().default(20).describe("Number of trades"),
});

export type GetTradeHistoryParams = z.infer<typeof GetTradeHistorySchema>;

export async function getTradeHistory(params: GetTradeHistoryParams, dexOptions: DexOptions = {}) {
  const subaccountAddr = resolveSubaccountAddress(dexOptions);
  const readDex = createReadDex(dexOptions);

  const trades = await readDex.userTradeHistory.getByAddr({
    subAddr: subaccountAddr,
    limit: params.limit,
  });

  return { trades: trades.items };
}
