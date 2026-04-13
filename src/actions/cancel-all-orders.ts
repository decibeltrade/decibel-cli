import { z } from "zod";

import {
  createReadDex,
  createWriteDex,
  DexOptions,
  resolveSubaccountAddress,
} from "../services/dex-factory.js";
import { findMarket } from "./utils.js";

export const CancelAllOrdersSchema = z.object({
  symbol: z.string().optional().describe("Only cancel orders for specific market"),
});

export type CancelAllOrdersParams = z.infer<typeof CancelAllOrdersSchema>;

export interface CancelAllOrdersResult {
  cancelled: number;
  failed: number;
  total: number;
}

export async function cancelAllOrders(
  params: CancelAllOrdersParams,
  dexOptions: DexOptions = {},
): Promise<CancelAllOrdersResult> {
  const subaccountAddr = resolveSubaccountAddress(dexOptions);
  const readDex = createReadDex(dexOptions);

  const ordersResponse = await readDex.userOpenOrders.getByAddr({ subAddr: subaccountAddr });
  let orders = ordersResponse.items;

  if (params.symbol) {
    const market = await findMarket(readDex, params.symbol);
    orders = orders.filter((o) => o.market.toLowerCase() === market.market_addr.toLowerCase());
  }

  if (orders.length === 0) {
    return { cancelled: 0, failed: 0, total: 0 };
  }

  const writeDex = await createWriteDex(dexOptions);

  let cancelled = 0;
  let failed = 0;

  for (const order of orders) {
    try {
      await writeDex.cancelOrder({
        orderId: order.order_id,
        marketAddr: order.market,
        subaccountAddr,
      });
      cancelled++;
    } catch {
      failed++;
    }
  }

  return { cancelled, failed, total: orders.length };
}
