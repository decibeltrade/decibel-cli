import { z } from "zod";

import { createReadDex, DexOptions, resolveSubaccountAddress } from "../services/dex-factory.js";
import { findMarket } from "./utils.js";

export const GetTpSlSchema = z.object({
  symbol: z.string().describe("Market symbol (e.g., BTC/USD)"),
});

export type GetTpSlParams = z.infer<typeof GetTpSlSchema>;

export async function getTpSl(params: GetTpSlParams, dexOptions: DexOptions = {}) {
  const subaccountAddr = resolveSubaccountAddress(dexOptions);
  const readDex = createReadDex(dexOptions);

  const market = await findMarket(readDex, params.symbol);

  // Get position-level TP/SL from the position itself
  const positions = await readDex.userPositions.getByAddr({
    subAddr: subaccountAddr,
    limit: 100,
  });
  const position = positions.find(
    (p) => p.market.toLowerCase() === market.market_addr.toLowerCase(),
  );

  // Get fixed-size TP/SL orders from open orders
  const ordersResponse = await readDex.userOpenOrders.getByAddr({ subAddr: subaccountAddr });
  const tpSlOrders = ordersResponse.items.filter(
    (o) => o.is_tpsl && o.market.toLowerCase() === market.market_addr.toLowerCase(),
  );

  return {
    symbol: params.symbol,
    position: position
      ? {
          size: position.size,
          entryPrice: position.entry_price,
          tpOrderId: position.tp_order_id,
          tpTriggerPrice: position.tp_trigger_price,
          tpLimitPrice: position.tp_limit_price,
          slOrderId: position.sl_order_id,
          slTriggerPrice: position.sl_trigger_price,
          slLimitPrice: position.sl_limit_price,
          hasFixedSizedTpSls: position.has_fixed_sized_tpsls,
        }
      : null,
    orders: tpSlOrders.map((o) => ({
      orderId: o.order_id,
      side: o.is_buy ? "buy" : "sell",
      size: o.remaining_size,
      price: o.price,
      orderType: o.order_type ?? null,
      triggerCondition: o.trigger_condition ?? null,
      tpTriggerPrice: o.tp_trigger_price,
      tpLimitPrice: o.tp_limit_price,
      slTriggerPrice: o.sl_trigger_price,
      slLimitPrice: o.sl_limit_price,
    })),
  };
}
