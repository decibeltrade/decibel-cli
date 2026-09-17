import { z } from "zod";

import { createReadDex, DexOptions, resolveSubaccountAddress } from "../services/dex-factory.js";

export const GetSpotTradeHistorySchema = z.object({
  limit: z.number().int().min(1).max(100).optional().default(20).describe("Number of trades"),
});

export type GetSpotTradeHistoryParams = z.infer<typeof GetSpotTradeHistorySchema>;

export async function getSpotTradeHistory(
  params: GetSpotTradeHistoryParams,
  dexOptions: DexOptions = {},
) {
  const subaccountAddr = resolveSubaccountAddress(dexOptions);
  const readDex = createReadDex(dexOptions);

  const trades = await readDex.userTradeHistory.getByAddr({
    subAddr: subaccountAddr,
    limit: params.limit,
    assetType: "spot",
  });

  return { trades: trades.items };
}
