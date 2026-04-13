import { z } from "zod";

import {
  createReadDex,
  createWriteDex,
  DexOptions,
  resolveSubaccountAddress,
} from "../services/dex-factory.js";
import { findMarket } from "./utils.js";

export const SetMarginTypeSchema = z.object({
  symbol: z.string().describe("Market symbol"),
  marginType: z.enum(["cross", "isolated"]).describe("Margin type"),
});

export type SetMarginTypeParams = z.infer<typeof SetMarginTypeSchema>;

export async function setMarginType(params: SetMarginTypeParams, dexOptions: DexOptions = {}) {
  const subaccountAddr = resolveSubaccountAddress(dexOptions);
  const readDex = createReadDex(dexOptions);
  const market = await findMarket(readDex, params.symbol);

  // Read the current leverage from the position so we can preserve it.
  // Include deleted positions so we pick up the user's leverage setting
  // even when there is no active position open for this market.
  const positions = await readDex.userPositions.getByAddr({
    subAddr: subaccountAddr,
    includeDeleted: true,
    limit: 100,
  });
  const position = positions.find(
    (p) => p.market.toLowerCase() === market.market_addr.toLowerCase(),
  );

  const currentLeverage = position?.user_leverage ?? 1;

  const writeDex = await createWriteDex(dexOptions);
  const result = await writeDex.configureUserSettingsForMarket({
    marketAddr: market.market_addr,
    subaccountAddr,
    isCross: params.marginType === "cross",
    userLeverage: currentLeverage,
  });

  return {
    success: true as const,
    symbol: params.symbol,
    marginType: params.marginType,
    leverage: currentLeverage,
    transactionHash: result.hash,
  };
}
