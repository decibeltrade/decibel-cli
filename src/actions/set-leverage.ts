import { z } from "zod";

import {
  createReadDex,
  createWriteDex,
  DexOptions,
  resolveSubaccountAddress,
} from "../services/dex-factory.js";
import { findMarket } from "./utils.js";

export const SetLeverageSchema = z.object({
  symbol: z.string().describe("Market symbol"),
  leverage: z.number().int().min(1).describe("Leverage value"),
  marginType: z.enum(["cross", "isolated"]).optional().default("cross").describe("Margin type"),
});

export type SetLeverageParams = z.infer<typeof SetLeverageSchema>;

export async function setLeverage(params: SetLeverageParams, dexOptions: DexOptions = {}) {
  const readDex = createReadDex(dexOptions);
  const market = await findMarket(readDex, params.symbol);

  if (params.leverage > market.max_leverage) {
    throw new Error(
      `Leverage ${params.leverage}x exceeds maximum ${market.max_leverage}x for ${params.symbol}`,
    );
  }

  const writeDex = await createWriteDex(dexOptions);
  const subaccountAddr = resolveSubaccountAddress(dexOptions);

  const result = await writeDex.configureUserSettingsForMarket({
    marketAddr: market.market_addr,
    subaccountAddr,
    isCross: params.marginType === "cross",
    userLeverage: params.leverage,
  });

  return {
    success: true as const,
    symbol: params.symbol,
    leverage: params.leverage,
    marginType: params.marginType,
    transactionHash: result.hash,
  };
}
