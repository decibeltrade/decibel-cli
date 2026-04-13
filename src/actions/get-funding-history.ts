import { z } from "zod";

import { createReadDex, DexOptions, resolveSubaccountAddress } from "../services/dex-factory.js";

export const GetFundingHistorySchema = z.object({
  limit: z.number().int().min(1).max(200).optional().default(20).describe("Number of records"),
});

export type GetFundingHistoryParams = z.infer<typeof GetFundingHistorySchema>;

export async function getFundingHistory(
  params: GetFundingHistoryParams,
  dexOptions: DexOptions = {},
) {
  const subaccountAddr = resolveSubaccountAddress(dexOptions);
  const readDex = createReadDex(dexOptions);

  const history = await readDex.userFundingHistory.getByAddr({
    subAddr: subaccountAddr,
    limit: params.limit,
  });

  return { funding: history.items };
}
