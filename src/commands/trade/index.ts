import { Command } from "commander";
import inquirer from "inquirer";

import {
  createReadDex,
  createWriteDex,
  getConfig,
  resolveAddress,
  getSubaccountAddress,
  DexOptions,
} from "../../services/dex-factory.js";
import {
  createTable,
  formatOutput,
  formatPrice,
  formatNumber,
  formatPnL,
  formatSide,
  formatAddress,
  printError,
  printSuccess,
  OutputOptions,
} from "../../utils/output.js";
import { NetworkName } from "../../utils/config.js";
import { TimeInForce } from "@decibeltrade/sdk";

interface TradeCommandOptions extends OutputOptions {
  network?: NetworkName;
  account?: string;
  watch?: boolean;
}

export function createTradeCommand(): Command {
  const trade = new Command("trade").description("Trading commands");

  // Order subcommand
  const order = trade.command("order").description("Place and manage orders");

  // Place limit order
  order
    .command("limit <side> <size> <symbol> <price>")
    .description("Place a limit order")
    .option("--json", "Output in JSON format")
    .option("--network <network>", "Network to use (testnet, netna, local)")
    .option("--account <alias>", "Use specific account")
    .option("--tif <tif>", "Time in force: gtc, post-only, ioc", "gtc")
    .option("--reduce-only", "Reduce-only order")
    .option("--client-id <id>", "Client order ID")
    .action(
      async (
        side: string,
        size: string,
        symbol: string,
        price: string,
        options: TradeCommandOptions & {
          tif?: string;
          reduceOnly?: boolean;
          clientId?: string;
        }
      ) => {
        try {
          const isBuy = ["buy", "long"].includes(side.toLowerCase());
          const sizeNum = parseFloat(size);
          const priceNum = parseFloat(price);

          if (isNaN(sizeNum) || sizeNum <= 0) {
            printError("Invalid size");
            process.exit(1);
          }
          if (isNaN(priceNum) || priceNum <= 0) {
            printError("Invalid price");
            process.exit(1);
          }

          // Parse time in force
          let timeInForce: TimeInForce = TimeInForce.GoodTillCanceled;
          if (options.tif) {
            switch (options.tif.toLowerCase()) {
              case "gtc":
                timeInForce = TimeInForce.GoodTillCanceled;
                break;
              case "post-only":
              case "alo":
                timeInForce = TimeInForce.PostOnly;
                break;
              case "ioc":
                timeInForce = TimeInForce.ImmediateOrCancel;
                break;
              default:
                printError(`Invalid time in force: ${options.tif}. Use gtc, post-only, or ioc`);
                process.exit(1);
            }
          }

          const writeDex = await createWriteDex({
            network: options.network,
            account: options.account,
          });

          // Get market config for decimals and tick size
          const readDex = createReadDex({ network: options.network });
          const markets = await readDex.markets.getAll();
          const market = markets.find(
            (m) => m.market_name.toLowerCase() === symbol.toLowerCase()
          );

          if (!market) {
            printError(`Market "${symbol}" not found`);
            process.exit(1);
          }

          // Convert human-readable values to chain units
          const chainPrice = Math.round(priceNum * 10 ** market.px_decimals);
          const chainSize = Math.round(sizeNum * 10 ** market.sz_decimals);

          const result = await writeDex.placeOrder({
            marketName: symbol,
            price: chainPrice,
            size: chainSize,
            isBuy,
            timeInForce,
            isReduceOnly: options.reduceOnly ?? false,
            clientOrderId: options.clientId,
            tickSize: market.tick_size,
          });

          formatOutput(
            result,
            (r) => {
              if (r.success) {
                printSuccess(`Order placed successfully`);
                console.log(`Order ID: ${r.orderId ?? "N/A"}`);
                console.log(`Transaction: ${r.transactionHash}`);
              } else {
                printError(`Order failed: ${r.error}`);
              }
            },
            options
          );

          if (!result.success) {
            process.exit(1);
          }
        } catch (error) {
          printError(error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      }
    );

  // Place market order
  order
    .command("market <side> <size> <symbol>")
    .description("Place a market order")
    .option("--json", "Output in JSON format")
    .option("--network <network>", "Network to use (testnet, netna, local)")
    .option("--account <alias>", "Use specific account")
    .option("--reduce-only", "Reduce-only order")
    .option("--slippage <pct>", "Slippage percentage", "1")
    .option("--client-id <id>", "Client order ID")
    .action(
      async (
        side: string,
        size: string,
        symbol: string,
        options: TradeCommandOptions & {
          reduceOnly?: boolean;
          slippage?: string;
          clientId?: string;
        }
      ) => {
        try {
          const isBuy = ["buy", "long"].includes(side.toLowerCase());
          const sizeNum = parseFloat(size);
          const slippage = parseFloat(options.slippage || "1") / 100;

          if (isNaN(sizeNum) || sizeNum <= 0) {
            printError("Invalid size");
            process.exit(1);
          }

          const writeDex = await createWriteDex({
            network: options.network,
            account: options.account,
          });

          // Get current price for market order
          const readDex = createReadDex({ network: options.network });
          const prices = await readDex.marketPrices.getByName({ marketName: symbol });
          const currentPrice = prices[0]?.mark_px;

          if (!currentPrice) {
            printError(`Could not get current price for ${symbol}`);
            process.exit(1);
          }

          // Get market config for decimals and tick size
          const markets = await readDex.markets.getAll();
          const market = markets.find(
            (m) => m.market_name.toLowerCase() === symbol.toLowerCase()
          );

          if (!market) {
            printError(`Market "${symbol}" not found`);
            process.exit(1);
          }

          // Calculate limit price with slippage for market order
          const limitPrice = isBuy
            ? currentPrice * (1 + slippage)
            : currentPrice * (1 - slippage);

          // Convert human-readable values to chain units
          const chainPrice = Math.round(limitPrice * 10 ** market.px_decimals);
          const chainSize = Math.round(sizeNum * 10 ** market.sz_decimals);

          const result = await writeDex.placeOrder({
            marketName: symbol,
            price: chainPrice,
            size: chainSize,
            isBuy,
            timeInForce: TimeInForce.ImmediateOrCancel,
            isReduceOnly: options.reduceOnly ?? false,
            clientOrderId: options.clientId,
            tickSize: market.tick_size,
          });

          formatOutput(
            result,
            (r) => {
              if (r.success) {
                printSuccess(`Market order placed successfully`);
                console.log(`Order ID: ${r.orderId ?? "N/A"}`);
                console.log(`Transaction: ${r.transactionHash}`);
              } else {
                printError(`Order failed: ${r.error}`);
              }
            },
            options
          );

          if (!result.success) {
            process.exit(1);
          }
        } catch (error) {
          printError(error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      }
    );

  // Cancel order
  trade
    .command("cancel <orderId>")
    .description("Cancel an order")
    .requiredOption("--market <symbol>", "Market symbol")
    .option("--json", "Output in JSON format")
    .option("--network <network>", "Network to use (testnet, netna, local)")
    .option("--account <alias>", "Use specific account")
    .action(
      async (
        orderId: string,
        options: TradeCommandOptions & { market: string }
      ) => {
        try {
          const writeDex = await createWriteDex({
            network: options.network,
            account: options.account,
          });

          const result = await writeDex.cancelOrder({
            orderId,
            marketName: options.market,
          });

          formatOutput(
            { success: true, transactionHash: result.hash },
            (r) => {
              printSuccess(`Order ${orderId} cancelled`);
              console.log(`Transaction: ${r.transactionHash}`);
            },
            options
          );
        } catch (error) {
          printError(error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      }
    );

  // Cancel all orders
  trade
    .command("cancel-all")
    .description("Cancel all open orders")
    .option("--market <symbol>", "Only cancel orders for specific market")
    .option("--json", "Output in JSON format")
    .option("--network <network>", "Network to use (testnet, netna, local)")
    .option("--account <alias>", "Use specific account")
    .option("-y, --yes", "Skip confirmation")
    .action(async (options: TradeCommandOptions & { market?: string; yes?: boolean }) => {
      try {
        const dexOptions: DexOptions = {
          network: options.network,
          account: options.account,
        };

        const address = resolveAddress(dexOptions);
        const config = getConfig(dexOptions);
        const subaccountAddr = getSubaccountAddress(address, config);

        const readDex = createReadDex(dexOptions);
        const ordersResponse = await readDex.userOpenOrders.getByAddr({ subAddr: subaccountAddr });
        let orders = ordersResponse.items;

        if (options.market) {
          orders = orders.filter(
            (o) => o.market.toLowerCase() === options.market!.toLowerCase()
          );
        }

        if (orders.length === 0) {
          console.log("No open orders to cancel");
          return;
        }

        if (!options.yes) {
          const confirm = await inquirer.prompt([
            {
              type: "confirm",
              name: "confirm",
              message: `Cancel ${orders.length} order(s)?`,
              default: false,
            },
          ]);
          if (!confirm.confirm) {
            console.log("Cancelled");
            return;
          }
        }

        const writeDex = await createWriteDex(dexOptions);

        let cancelled = 0;
        let failed = 0;

        for (const order of orders) {
          try {
            await writeDex.cancelOrder({
              orderId: order.order_id,
              marketAddr: order.market,
            });
            cancelled++;
          } catch {
            failed++;
          }
        }

        formatOutput(
          { cancelled, failed, total: orders.length },
          (r) => {
            printSuccess(`Cancelled ${r.cancelled} order(s)`);
            if (r.failed > 0) {
              printError(`Failed to cancel ${r.failed} order(s)`);
            }
          },
          options
        );
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // Set leverage
  trade
    .command("set-leverage <symbol> <leverage>")
    .description("Set leverage for a market")
    .option("--json", "Output in JSON format")
    .option("--network <network>", "Network to use (testnet, netna, local)")
    .option("--account <alias>", "Use specific account")
    .option("--cross", "Use cross margin (default)")
    .option("--isolated", "Use isolated margin")
    .action(
      async (
        symbol: string,
        leverage: string,
        options: TradeCommandOptions & { cross?: boolean; isolated?: boolean }
      ) => {
        try {
          const leverageNum = parseInt(leverage, 10);
          if (isNaN(leverageNum) || leverageNum < 1) {
            printError("Invalid leverage value");
            process.exit(1);
          }

          const writeDex = await createWriteDex({
            network: options.network,
            account: options.account,
          });

          const readDex = createReadDex({ network: options.network });
          const markets = await readDex.markets.getAll();
          const market = markets.find(
            (m) => m.market_name.toLowerCase() === symbol.toLowerCase()
          );

          if (!market) {
            printError(`Market ${symbol} not found`);
            process.exit(1);
          }

          if (leverageNum > market.max_leverage) {
            printError(
              `Leverage ${leverageNum}x exceeds maximum ${market.max_leverage}x for ${symbol}`
            );
            process.exit(1);
          }

          const isCross = !options.isolated;

          const result = await writeDex.configureUserSettingsForMarket({
            marketAddr: market.market_addr,
            subaccountAddr: "", // Will use default
            isCross,
            userLeverage: leverageNum,
          });

          formatOutput(
            { symbol, leverage: leverageNum, type: isCross ? "cross" : "isolated" },
            (r) => {
              printSuccess(`Leverage set to ${r.leverage}x (${r.type}) for ${r.symbol}`);
            },
            options
          );
        } catch (error) {
          printError(error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      }
    );

  // View positions
  trade
    .command("positions")
    .description("View open positions")
    .option("--json", "Output in JSON format")
    .option("--network <network>", "Network to use (testnet, netna, local)")
    .option("--account <alias>", "Use specific account")
    .option("-w, --watch", "Watch positions in real-time")
    .action(async (options: TradeCommandOptions) => {
      try {
        const dexOptions: DexOptions = {
          network: options.network,
          account: options.account,
        };

        const address = resolveAddress(dexOptions);
        const config = getConfig(dexOptions);
        const subaccountAddr = getSubaccountAddress(address, config);

        const readDex = createReadDex(dexOptions);

        if (options.watch) {
          console.log("Watching positions... (Ctrl+C to stop)\n");

          const unsubscribe = readDex.userPositions.subscribeByAddr(subaccountAddr, (data) => {
            console.clear();
            console.log(`Positions - ${new Date().toLocaleTimeString()}\n`);
            renderPositions(data.positions, options);
          });

          process.on("SIGINT", () => {
            unsubscribe();
            console.log("\n");
            process.exit(0);
          });

          await new Promise(() => {});
        } else {
          const positions = await readDex.userPositions.getByAddr({
            subAddr: subaccountAddr,
            limit: 100,
          });

          formatOutput(positions, (pos) => renderPositions(pos, options), options);
        }
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // View open orders
  trade
    .command("orders")
    .description("View open orders")
    .option("--json", "Output in JSON format")
    .option("--network <network>", "Network to use (testnet, netna, local)")
    .option("--account <alias>", "Use specific account")
    .option("-w, --watch", "Watch orders in real-time")
    .action(async (options: TradeCommandOptions) => {
      try {
        const dexOptions: DexOptions = {
          network: options.network,
          account: options.account,
        };

        const address = resolveAddress(dexOptions);
        const config = getConfig(dexOptions);
        const subaccountAddr = getSubaccountAddress(address, config);

        const readDex = createReadDex(dexOptions);

        if (options.watch) {
          console.log("Watching orders... (Ctrl+C to stop)\n");

          const unsubscribe = readDex.userOpenOrders.subscribeByAddr(subaccountAddr, (data) => {
            console.clear();
            console.log(`Open Orders - ${new Date().toLocaleTimeString()}\n`);
            renderOrders(data.orders, options);
          });

          process.on("SIGINT", () => {
            unsubscribe();
            console.log("\n");
            process.exit(0);
          });

          await new Promise(() => {});
        } else {
          const ordersResponse = await readDex.userOpenOrders.getByAddr({ subAddr: subaccountAddr });

          formatOutput(ordersResponse.items, (ord) => renderOrders(ord, options), options);
        }
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // Trade history
  trade
    .command("history")
    .description("View trade history")
    .option("--json", "Output in JSON format")
    .option("--network <network>", "Network to use (testnet, netna, local)")
    .option("--account <alias>", "Use specific account")
    .option("--limit <limit>", "Number of trades to show", "20")
    .action(async (options: TradeCommandOptions & { limit?: string }) => {
      try {
        const dexOptions: DexOptions = {
          network: options.network,
          account: options.account,
        };

        const address = resolveAddress(dexOptions);
        const config = getConfig(dexOptions);
        const subaccountAddr = getSubaccountAddress(address, config);

        const readDex = createReadDex(dexOptions);
        const trades = await readDex.userTradeHistory.getByAddr({
          subAddr: subaccountAddr,
          limit: parseInt(options.limit || "20", 10),
        });

        formatOutput(
          trades.items,
          (tradeList) => {
            if (tradeList.length === 0) {
              console.log("No trade history");
              return;
            }

            const table = createTable([
              "Time",
              "Market",
              "Action",
              "Size",
              "Price",
              "Fee",
              "PnL",
            ]);

            for (const t of tradeList) {
              table.push([
                new Date(t.transaction_unix_ms).toLocaleString(),
                formatAddress(t.market, 6),
                t.action,
                formatNumber(t.size, 4),
                formatPrice(t.price),
                formatNumber(t.fee_amount, 4),
                formatPnL(t.realized_pnl_amount),
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

  return trade;
}

function renderPositions(positions: any[], options: OutputOptions): void {
  if (positions.length === 0) {
    console.log("No open positions");
    return;
  }

  const table = createTable([
    "Market",
    "Side",
    "Size",
    "Entry",
    "Mark",
    "uPnL",
    "Leverage",
    "Liq Price",
  ]);

  for (const p of positions) {
    const isLong = p.size > 0;
    table.push([
      p.market_name,
      formatSide(isLong ? "long" : "short"),
      formatNumber(Math.abs(p.size), 4),
      formatPrice(p.entry_price),
      formatPrice(p.mark_price ?? 0),
      formatPnL(p.unrealized_pnl ?? 0),
      `${p.leverage ?? "-"}x`,
      p.liquidation_price ? formatPrice(p.liquidation_price) : "-",
    ]);
  }
  console.log(table.toString());
}

function renderOrders(orders: any[], options: OutputOptions): void {
  if (orders.length === 0) {
    console.log("No open orders");
    return;
  }

  const table = createTable([
    "ID",
    "Market",
    "Side",
    "Size",
    "Price",
    "Filled",
    "Type",
    "Status",
  ]);

  for (const o of orders) {
    const filledSize = (o.orig_size ?? 0) - (o.remaining_size ?? 0);
    table.push([
      formatAddress(o.order_id, 4),
      formatAddress(o.market, 6),
      formatSide(o.is_buy ? "buy" : "sell"),
      formatNumber(o.remaining_size ?? 0, 4),
      formatPrice(o.price ?? 0),
      formatNumber(filledSize, 4),
      o.order_type ?? "limit",
      o.details ?? "open",
    ]);
  }
  console.log(table.toString());
}
