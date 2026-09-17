import { z } from "zod";

import { createReadDex, DexOptions, resolveSubaccountAddress } from "../services/dex-factory.js";

export const GetSpotOrderHistorySchema = z.object({
  limit: z.number().int().min(1).max(200).optional().default(20).describe("Number of records"),
});

export type GetSpotOrderHistoryParams = z.infer<typeof GetSpotOrderHistorySchema>;

export async function getSpotOrderHistory(
  params: GetSpotOrderHistoryParams,
  dexOptions: DexOptions = {},
) {
  const subaccountAddr = resolveSubaccountAddress(dexOptions);
  const readDex = createReadDex(dexOptions);

  const history = await readDex.userOrderHistory.getByAddr({
    subAddr: subaccountAddr,
    limit: params.limit,
    assetType: "spot",
  });

  return { orders: history.items };
}
