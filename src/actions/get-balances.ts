import { createReadDex, DexOptions, resolveSubaccountAddress } from "../services/dex-factory.js";

export async function getBalances(dexOptions: DexOptions = {}) {
  const subaccountAddr = resolveSubaccountAddress(dexOptions);
  const readDex = createReadDex(dexOptions);

  const overview = await readDex.accountOverview.getByAddr({ subAddr: subaccountAddr });

  return {
    subaccountAddress: subaccountAddr,
    perpEquityBalance: overview.perp_equity_balance,
    unrealizedPnl: overview.unrealized_pnl,
    crossWithdrawable: overview.usdc_cross_withdrawable_balance,
    isolatedWithdrawable: overview.usdc_isolated_withdrawable_balance,
    totalMargin: overview.total_margin,
    maintenanceMargin: overview.maintenance_margin,
  };
}
