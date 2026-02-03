/**
 * MCP Account Tools
 *
 * Tools for account management - balances, deposits, withdrawals.
 */

import { z } from "zod";

import {
  createReadDex,
  createWriteDex,
  getConfig,
  resolveAddress,
  getSubaccountAddress,
  DexOptions,
} from "../../services/dex-factory.js";

// Tool schemas
export const GetBalancesSchema = z.object({}).describe("Get account balances");

export const DepositSchema = z.object({
  amount: z.number().positive().describe("Amount of USDC to deposit"),
});

export const WithdrawSchema = z.object({
  amount: z.number().positive().describe("Amount of USDC to withdraw"),
});

// Tool implementations
export async function getBalances(dexOptions: DexOptions = {}) {
  const address = resolveAddress(dexOptions);
  const config = getConfig(dexOptions);
  const subaccountAddr = getSubaccountAddress(address, config);

  const readDex = createReadDex(dexOptions);

  const [walletBalance, accountOverview] = await Promise.all([
    readDex.usdcBalance(address),
    readDex.accountOverview.getByAddr({ subAddr: subaccountAddr }),
  ]);

  return {
    walletAddress: address,
    subaccountAddress: subaccountAddr,
    walletBalance,
    perpEquityBalance: accountOverview.perp_equity_balance,
    unrealizedPnl: accountOverview.unrealized_pnl,
    crossWithdrawable: accountOverview.usdc_cross_withdrawable_balance,
    isolatedWithdrawable: accountOverview.usdc_isolated_withdrawable_balance,
    totalMargin: accountOverview.total_margin,
    maintenanceMargin: accountOverview.maintenance_margin,
  };
}

export async function deposit(
  params: z.infer<typeof DepositSchema>,
  dexOptions: DexOptions = {}
) {
  const writeDex = await createWriteDex(dexOptions);
  const readDex = createReadDex(dexOptions);

  // Get USDC decimals
  const usdcDecimals = await readDex.usdcDecimals();
  const chainAmount = Math.floor(params.amount * 10 ** usdcDecimals);

  const result = await writeDex.deposit(chainAmount);

  return {
    success: true,
    amount: params.amount,
    transactionHash: result.hash,
  };
}

export async function withdraw(
  params: z.infer<typeof WithdrawSchema>,
  dexOptions: DexOptions = {}
) {
  const writeDex = await createWriteDex(dexOptions);
  const readDex = createReadDex(dexOptions);

  // Get USDC decimals
  const usdcDecimals = await readDex.usdcDecimals();
  const chainAmount = Math.floor(params.amount * 10 ** usdcDecimals);

  const result = await writeDex.withdraw(chainAmount);

  return {
    success: true,
    amount: params.amount,
    transactionHash: result.hash,
  };
}
