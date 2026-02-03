import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import { submitFeePaidTransaction } from "@decibeltrade/sdk";
import { Command } from "commander";

import {
  createReadDex,
  createWriteDex,
  getConfig,
  resolveAccount,
  resolveAddress,
  getSubaccountAddress,
  DexOptions,
} from "../../services/dex-factory.js";
import {
  createTable,
  formatOutput,
  formatPrice,
  formatTimestamp,
  printError,
  printSuccess,
  printInfo,
  OutputOptions,
} from "../../utils/output.js";
import { NetworkName } from "../../utils/config.js";

interface FundsCommandOptions extends OutputOptions {
  network?: NetworkName;
  account?: string;
}

/**
 * Funds commands handle deposits and withdrawals between wallet and trading account.
 *
 * Flow:
 * 1. User's wallet holds USDC
 * 2. `funds deposit` moves USDC from wallet -> subaccount (for trading)
 * 3. `funds withdraw` moves USDC from subaccount -> wallet
 */
export function createFundsCommand(): Command {
  const funds = new Command("funds").description("Manage deposits and withdrawals");

  // Deposit funds to trading account
  funds
    .command("deposit <amount>")
    .description("Deposit USDC to trading account")
    .option("--json", "Output in JSON format")
    .option("--network <network>", "Network to use (testnet, netna, local)")
    .option("--account <alias>", "Use specific account")
    .action(async (amount: string, options: FundsCommandOptions) => {
      try {
        const amountNum = parseFloat(amount);
        if (isNaN(amountNum) || amountNum <= 0) {
          printError("Invalid amount");
          process.exit(1);
        }

        const writeDex = await createWriteDex({
          network: options.network,
          account: options.account,
        });

        // Get USDC decimals (typically 6)
        const readDex = createReadDex({ network: options.network });
        const usdcDecimals = await readDex.usdcDecimals();

        // Convert to chain units (e.g., 100 USDC = 100 * 10^6 = 100,000,000)
        const chainAmount = Math.floor(amountNum * 10 ** usdcDecimals);

        const result = await writeDex.deposit(chainAmount);

        formatOutput(
          {
            success: true,
            amount: amountNum,
            transactionHash: result.hash,
          },
          (r) => {
            printSuccess(`Deposited ${formatPrice(r.amount)}`);
            console.log(`Transaction: ${r.transactionHash}`);
          },
          options
        );
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // Withdraw funds from trading account
  funds
    .command("withdraw <amount>")
    .description("Withdraw USDC from trading account")
    .option("--json", "Output in JSON format")
    .option("--network <network>", "Network to use (testnet, netna, local)")
    .option("--account <alias>", "Use specific account")
    .action(async (amount: string, options: FundsCommandOptions) => {
      try {
        const amountNum = parseFloat(amount);
        if (isNaN(amountNum) || amountNum <= 0) {
          printError("Invalid amount");
          process.exit(1);
        }

        const writeDex = await createWriteDex({
          network: options.network,
          account: options.account,
        });

        // Get USDC decimals
        const readDex = createReadDex({ network: options.network });
        const usdcDecimals = await readDex.usdcDecimals();

        // Convert to chain units
        const chainAmount = Math.floor(amountNum * 10 ** usdcDecimals);

        const result = await writeDex.withdraw(chainAmount);

        formatOutput(
          {
            success: true,
            amount: amountNum,
            transactionHash: result.hash,
          },
          (r) => {
            printSuccess(`Withdrew ${formatPrice(r.amount)}`);
            console.log(`Transaction: ${r.transactionHash}`);
          },
          options
        );
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // View deposit/withdraw history
  funds
    .command("history")
    .description("View deposit and withdrawal history")
    .option("--json", "Output in JSON format")
    .option("--network <network>", "Network to use (testnet, netna, local)")
    .option("--account <alias>", "Use specific account")
    .option("--limit <limit>", "Number of records to show", "20")
    .action(async (options: FundsCommandOptions & { limit?: string }) => {
      try {
        const dexOptions: DexOptions = {
          network: options.network,
          account: options.account,
        };

        const address = resolveAddress(dexOptions);
        const config = getConfig(dexOptions);
        const subaccountAddr = getSubaccountAddress(address, config);

        const readDex = createReadDex(dexOptions);
        const history = await readDex.userFundHistory.getByAddr({
          subAddr: subaccountAddr,
          limit: parseInt(options.limit || "20", 10),
        });

        formatOutput(
          history.funds,
          (records) => {
            if (records.length === 0) {
              console.log("No fund history");
              return;
            }

            const table = createTable(["Time", "Type", "Amount", "Balance After"]);

            for (const r of records) {
              table.push([
                formatTimestamp(r.timestamp),
                r.movement_type.toUpperCase(),
                formatPrice(r.amount),
                formatPrice(r.balance_after),
              ]);
            }
            console.log(table.toString());
          },
          options
        );
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // View balances (wallet + trading account)
  funds
    .command("balances")
    .description("View wallet and trading account balances")
    .option("--json", "Output in JSON format")
    .option("--network <network>", "Network to use (testnet, netna, local)")
    .option("--account <alias>", "Use specific account")
    .action(async (options: FundsCommandOptions) => {
      try {
        const dexOptions: DexOptions = {
          network: options.network,
          account: options.account,
        };

        const address = resolveAddress(dexOptions);
        const config = getConfig(dexOptions);
        const subaccountAddr = getSubaccountAddress(address, config);

        const readDex = createReadDex(dexOptions);

        // Fetch both wallet and trading account balances
        const [walletBalance, accountOverview] = await Promise.all([
          readDex.usdcBalance(address),
          readDex.accountOverview.getByAddr({ subAddr: subaccountAddr }),
        ]);

        const data = {
          walletBalance,
          perpEquityBalance: accountOverview.perp_equity_balance,
          unrealizedPnl: accountOverview.unrealized_pnl,
          crossWithdrawable: accountOverview.usdc_cross_withdrawable_balance,
          isolatedWithdrawable: accountOverview.usdc_isolated_withdrawable_balance,
        };

        formatOutput(
          data,
          (d) => {
            const table = createTable(["Balance Type", "Amount"]);
            table.push(["Wallet USDC", formatPrice(d.walletBalance)]);
            table.push(["Account Value", formatPrice(d.perpEquityBalance)]);
            table.push(["Unrealized PnL", formatPrice(d.unrealizedPnl)]);
            table.push(["Withdrawable (Cross)", formatPrice(d.crossWithdrawable)]);
            table.push(["Withdrawable (Isolated)", formatPrice(d.isolatedWithdrawable)]);
            console.log(table.toString());
          },
          options
        );
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // Faucet - mint testnet USDC (testnet only)
  funds
    .command("faucet")
    .description("Mint testnet USDC to your wallet (testnet only, max $1000/day)")
    .option("--amount <amount>", "Amount of USDC to mint (default: 1000)", "1000")
    .option("--deposit", "Also deposit minted USDC to trading account")
    .option("--json", "Output in JSON format")
    .option("--network <network>", "Network to use (testnet, netna, local)")
    .option("--account <alias>", "Use specific account")
    .action(async (options: FundsCommandOptions & { amount?: string; deposit?: boolean }) => {
      try {
        const dexOptions: DexOptions = {
          network: options.network,
          account: options.account,
        };

        // Resolve account (need the actual account for signing)
        const { account } = await resolveAccount(dexOptions);
        const config = getConfig(dexOptions);
        const readDex = createReadDex(dexOptions);

        // Check if minting is available for this account
        const availableMint = await readDex.availableRestrictedMintFor(
          account.accountAddress.toString()
        );

        if (availableMint === 0) {
          // Get reset timestamp
          const resetTs = await readDex.getAccountTriggerResetMintTs(
            account.accountAddress.toString()
          );
          const resetDate = new Date(resetTs * 1000);
          printError(
            `Daily mint limit reached. Next mint available at: ${resetDate.toLocaleString()}`
          );
          process.exit(1);
        }

        // Get USDC decimals
        const usdcDecimals = await readDex.usdcDecimals();

        // Parse amount and validate
        const requestedAmount = parseFloat(options.amount || "1000");
        const maxAmount = availableMint / 10 ** usdcDecimals;

        if (requestedAmount > maxAmount) {
          printError(`Requested amount $${requestedAmount} exceeds available mint $${maxAmount}`);
          process.exit(1);
        }

        // Convert to chain units
        const chainAmount = Math.floor(requestedAmount * 10 ** usdcDecimals);

        // Create Aptos client
        let aptosConfig: AptosConfig;
        if (config.fullnodeUrl.includes("localhost") || config.fullnodeUrl.includes("127.0.0.1")) {
          aptosConfig = new AptosConfig({
            fullnode: config.fullnodeUrl,
            network: Network.CUSTOM
          });
        } else if (config.fullnodeUrl.includes("testnet")) {
          aptosConfig = new AptosConfig({ network: Network.TESTNET });
        } else {
          aptosConfig = new AptosConfig({
            fullnode: config.fullnodeUrl,
            network: Network.CUSTOM
          });
        }
        const aptos = new Aptos(aptosConfig);

        printInfo(`Minting $${requestedAmount} USDC to wallet...`);

        // Build transaction with fee payer support
        const transaction = await aptos.transaction.build.simple({
          sender: account.accountAddress,
          data: {
            function: `${config.deployment.package}::usdc::restricted_mint`,
            typeArguments: [],
            functionArguments: [chainAmount],
          },
          withFeePayer: true, // Enable fee payer
        });

        // Sign the transaction
        const senderAuthenticator = aptos.transaction.sign({
          signer: account,
          transaction,
        });

        // Submit via fee payer service
        const pendingTx = await submitFeePaidTransaction(
          config,
          transaction,
          senderAuthenticator
        );

        const mintResult = await aptos.waitForTransaction({
          transactionHash: pendingTx.hash,
        });

        let depositResult: { hash: string } | null = null;

        // Optionally deposit to trading account
        if (options.deposit) {
          printInfo(`Depositing $${requestedAmount} USDC to trading account...`);
          const writeDex = await createWriteDex(dexOptions);
          depositResult = await writeDex.deposit(chainAmount);
        }

        formatOutput(
          {
            success: true,
            amount: requestedAmount,
            mintTransactionHash: mintResult.hash,
            depositTransactionHash: depositResult?.hash || null,
            deposited: !!options.deposit,
          },
          (r) => {
            printSuccess(`Minted $${r.amount} USDC`);
            console.log(`Mint transaction: ${r.mintTransactionHash}`);
            if (r.deposited && r.depositTransactionHash) {
              printSuccess(`Deposited $${r.amount} USDC to trading account`);
              console.log(`Deposit transaction: ${r.depositTransactionHash}`);
            }
          },
          options
        );
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  return funds;
}
