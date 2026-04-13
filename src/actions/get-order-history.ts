import { z } from "zod";

import { createReadDex, DexOptions, resolveSubaccountAddress } from "../services/dex-factory.js";

export const GetOrderHistorySchema = z.object({
  limit: z.number().int().min(1).max(200).optional().default(20).describe("Number of records"),
});

export type GetOrderHistoryParams = z.infer<typeof GetOrderHistorySchema>;

export async function getOrderHistory(params: GetOrderHistoryParams, dexOptions: DexOptions = {}) {
  const subaccountAddr = resolveSubaccountAddress(dexOptions);
  const readDex = createReadDex(dexOptions);

  const history = await readDex.userOrderHistory.getByAddr({
    subAddr: subaccountAddr,
    limit: params.limit,
  });

  return { orders: history.items };
}
