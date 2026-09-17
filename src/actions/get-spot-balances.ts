import { createReadDex, DexOptions, resolveSubaccountAddress } from "../services/dex-factory.js";

/**
 * Spot inventory for the subaccount: assets held in the primary fungible
 * store, plus the amounts locked behind resting spot orders.
 *
 * `spot` is null for wallet-only owners and absent against servers that
 * predate spot enrichment — both collapse to an empty view rather than an
 * error, so `spot balances` on a perp-only account prints "no spot holdings"
 * instead of failing.
 */
export async function getSpotBalances(dexOptions: DexOptions = {}) {
  const subaccountAddr = resolveSubaccountAddress(dexOptions);
  const readDex = createReadDex(dexOptions);

  const overview = await readDex.accountOverview.getByAddr({ subAddr: subaccountAddr });
  const spot = overview.spot;

  return {
    subaccountAddress: subaccountAddr,
    totalUsd: spot?.total_usd ?? 0,
    // Not the sum of the positions' PnL: it also covers base escrowed behind
    // resting orders. Null against servers predating spot PnL support.
    unrealizedPnlUsd: spot?.total_unrealized_pnl_usd ?? null,
    positions: (spot?.positions ?? []).map((p) => ({
      assetAddress: p.asset_addr,
      symbol: p.asset_symbol,
      amount: p.amount,
      usdValue: p.usd_value,
      entryNotionalUsd: p.entry_notional_usd,
      unrealizedPnlUsd: p.unrealized_pnl_usd,
    })),
    inFlightOrders: (spot?.in_flight_orders ?? []).map((o) => ({
      marketAddress: o.market_addr,
      orderId: o.order_id,
      isBid: o.is_bid,
      reservedAsset: o.reserved_asset,
      reservedAmount: o.reserved_amount,
      reservedUsdValue: o.reserved_usd_value,
    })),
    metrics: spot?.metrics
      ? {
          cumulativeVolumeUsd: spot.metrics.cumulative_volume_usd,
          cumulativeTakerFeesUsd: spot.metrics.cumulative_taker_fees_usd,
          cumulativeMakerFeesUsd: spot.metrics.cumulative_maker_fees_usd,
          cumulativeRealizedPnlUsd: spot.metrics.cumulative_realized_pnl_usd,
        }
      : null,
  };
}
