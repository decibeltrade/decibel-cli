import { z } from "zod";

import { createReadDex, DexOptions, resolveSubaccountAddress } from "../services/dex-factory.js";

export const GetTwapHistorySchema = z.object({
  limit: z.number().int().min(1).max(200).optional().default(20).describe("Number of records"),
});

export type GetTwapHistoryParams = z.infer<typeof GetTwapHistorySchema>;

export async function getTwapHistory(params: GetTwapHistoryParams, dexOptions: DexOptions = {}) {
  const subaccountAddr = resolveSubaccountAddress(dexOptions);
  const readDex = createReadDex(dexOptions);

  const history = await readDex.userTwapHistory.getByAddr({
    subAddr: subaccountAddr,
    limit: params.limit,
  });

  return { twaps: history.items };
}
