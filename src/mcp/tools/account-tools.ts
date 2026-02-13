/**
 * MCP Account Tools
 *
 * Tools for account management - balances, deposits, withdrawals.
 */

import { z } from "zod";

import {
  createReadDex,
  resolveSubaccountAddress,
  DexOptions,
} from "../../services/dex-factory.js";

// Tool schemas
export const GetBalancesSchema = z.object({}).describe("Get account balances");

// Tool implementations
export async function getBalances(dexOptions: DexOptions = {}) {
  const subaccountAddr = resolveSubaccountAddress(dexOptions);
  const readDex = createReadDex(dexOptions);

  const accountOverview = await readDex.accountOverview.getByAddr({
    subAddr: subaccountAddr,
  });

  return {
    subaccountAddress: subaccountAddr,
    perpEquityBalance: accountOverview.perp_equity_balance,
    unrealizedPnl: accountOverview.unrealized_pnl,
    crossWithdrawable: accountOverview.usdc_cross_withdrawable_balance,
    isolatedWithdrawable: accountOverview.usdc_isolated_withdrawable_balance,
    totalMargin: accountOverview.total_margin,
    maintenanceMargin: accountOverview.maintenance_margin,
  };
}
