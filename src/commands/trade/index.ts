import { Command } from "commander";
import inquirer from "inquirer";

import {
  cancelAllOrders,
  CancelAllOrdersSchema,
  cancelOrder,
  CancelOrderSchema,
  cancelTpSl,
  CancelTpSlSchema,
  cancelTwapOrder,
  CancelTwapOrderSchema,
  closePosition,
  ClosePositionSchema,
  getActiveTwaps,
  getFundingHistory,
  GetFundingHistorySchema,
  getOrderHistory,
  GetOrderHistorySchema,
  getOrders,
  getPositions,
  getTpSl,
  GetTpSlSchema,
  getTradeHistory,
  GetTradeHistorySchema,
  getTwapHistory,
  GetTwapHistorySchema,
  placeLimitOrder,
  PlaceLimitOrderSchema,
  placeMarketOrder,
  PlaceMarketOrderSchema,
  placeStopLimitOrder,
  PlaceStopLimitOrderSchema,
  placeStopMarketOrder,
  PlaceStopMarketOrderSchema,
  placeTpSl,
  PlaceTpSlSchema,
  placeTwapOrder,
  PlaceTwapOrderSchema,
  setLeverage,
  SetLeverageSchema,
  setMarginType,
  SetMarginTypeSchema,
} from "../../actions/index.js";
import { createReadDex, DexOptions, resolveSubaccountAddress } from "../../services/dex-factory.js";
import { NetworkName } from "../../utils/config.js";
import {
  createTable,
  formatAddress,
  formatNumber,
  formatOutput,
  formatPnL,
  formatPrice,
  formatSide,
  OutputOptions,
  printError,
  printSuccess,
} from "../../utils/output.js";

interface TradeCommandOptions extends OutputOptions {
  network?: NetworkName;
  account?: string;
  watch?: boolean;
  encrypt?: boolean;
}

function dexOpts(options: TradeCommandOptions): DexOptions {
  return { network: options.network, accountAlias: options.account, encrypt: options.encrypt };
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
    .option("--encrypt", "Submit as encrypted (mempool-private) transaction")
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
        },
      ) => {
        try {
          const params = PlaceLimitOrderSchema.parse({
            side,
            size: parseFloat(size),
            symbol,
            price: parseFloat(price),
            timeInForce: options.tif,
            reduceOnly: options.reduceOnly,
            clientOrderId: options.clientId,
          });

          const result = await placeLimitOrder(params, dexOpts(options));

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
            options,
          );

          if (!result.success) {
            process.exit(1);
          }
        } catch (error) {
          printError(error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      },
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
    .option("--encrypt", "Submit as encrypted (mempool-private) transaction")
    .action(
      async (
        side: string,
        size: string,
        symbol: string,
        options: TradeCommandOptions & {
          reduceOnly?: boolean;
          slippage?: string;
          clientId?: string;
        },
      ) => {
        try {
          const params = PlaceMarketOrderSchema.parse({
            side,
            size: parseFloat(size),
            symbol,
            slippage: options.slippage ? parseFloat(options.slippage) : undefined,
            reduceOnly: options.reduceOnly,
            clientOrderId: options.clientId,
          });

          const result = await placeMarketOrder(params, dexOpts(options));

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
            options,
          );

          if (!result.success) {
            process.exit(1);
          }
        } catch (error) {
          printError(error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      },
    );

  // Place stop limit order
  order
    .command("stop-limit <side> <size> <symbol> <price> <stopPrice>")
    .description("Place a stop limit order (triggers at stop price, executes at limit price)")
    .option("--json", "Output in JSON format")
    .option("--network <network>", "Network to use (testnet, netna, local)")
    .option("--account <alias>", "Use specific account")
    .option("--tif <tif>", "Time in force: gtc, post-only, ioc", "gtc")
    .option("--reduce-only", "Reduce-only order")
    .option("--client-id <id>", "Client order ID")
    .option("--encrypt", "Submit as encrypted (mempool-private) transaction")
    .action(
      async (
        side: string,
        size: string,
        symbol: string,
        price: string,
        stopPrice: string,
        options: TradeCommandOptions & {
          tif?: string;
          reduceOnly?: boolean;
          clientId?: string;
        },
      ) => {
        try {
          const params = PlaceStopLimitOrderSchema.parse({
            side,
            size: parseFloat(size),
            symbol,
            price: parseFloat(price),
            stopPrice: parseFloat(stopPrice),
            timeInForce: options.tif,
            reduceOnly: options.reduceOnly,
            clientOrderId: options.clientId,
          });

          const result = await placeStopLimitOrder(params, dexOpts(options));

          formatOutput(
            result,
            (r) => {
              if (r.success) {
                printSuccess(`Stop limit order placed successfully`);
                console.log(`Order ID: ${r.orderId ?? "N/A"}`);
                console.log(`Transaction: ${r.transactionHash}`);
              } else {
                printError(`Order failed: ${r.error}`);
              }
            },
            options,
          );

          if (!result.success) {
            process.exit(1);
          }
        } catch (error) {
          printError(error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      },
    );

  // Place stop market order
  order
    .command("stop-market <side> <size> <symbol> <stopPrice>")
    .description("Place a stop market order (triggers at stop price, executes immediately)")
    .option("--json", "Output in JSON format")
    .option("--network <network>", "Network to use (testnet, netna, local)")
    .option("--account <alias>", "Use specific account")
    .option("--reduce-only", "Reduce-only order")
    .option("--slippage <pct>", "Slippage percentage from stop price", "1")
    .option("--client-id <id>", "Client order ID")
    .option("--encrypt", "Submit as encrypted (mempool-private) transaction")
    .action(
      async (
        side: string,
        size: string,
        symbol: string,
        stopPrice: string,
        options: TradeCommandOptions & {
          reduceOnly?: boolean;
          slippage?: string;
          clientId?: string;
        },
      ) => {
        try {
          const params = PlaceStopMarketOrderSchema.parse({
            side,
            size: parseFloat(size),
            symbol,
            stopPrice: parseFloat(stopPrice),
            slippage: options.slippage ? parseFloat(options.slippage) : undefined,
            reduceOnly: options.reduceOnly,
            clientOrderId: options.clientId,
          });

          const result = await placeStopMarketOrder(params, dexOpts(options));

          formatOutput(
            result,
            (r) => {
              if (r.success) {
                printSuccess(`Stop market order placed successfully`);
                console.log(`Order ID: ${r.orderId ?? "N/A"}`);
                console.log(`Transaction: ${r.transactionHash}`);
              } else {
                printError(`Order failed: ${r.error}`);
              }
            },
            options,
          );

          if (!result.success) {
            process.exit(1);
          }
        } catch (error) {
          printError(error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      },
    );

  // Place TWAP order
  order
    .command("twap <side> <size> <symbol>")
    .description("Place a TWAP order (time-weighted average price)")
    .option("--json", "Output in JSON format")
    .option("--network <network>", "Network to use (testnet, netna, local)")
    .option("--account <alias>", "Use specific account")
    .requiredOption("--duration <seconds>", "Total duration in seconds")
    .requiredOption("--frequency <seconds>", "Execution frequency in seconds")
    .option("--reduce-only", "Reduce-only order")
    .option("--client-id <id>", "Client order ID")
    .option("--encrypt", "Submit as encrypted (mempool-private) transaction")
    .action(
      async (
        side: string,
        size: string,
        symbol: string,
        options: TradeCommandOptions & {
          duration: string;
          frequency: string;
          reduceOnly?: boolean;
          clientId?: string;
        },
      ) => {
        try {
          const params = PlaceTwapOrderSchema.parse({
            side,
            size: parseFloat(size),
            symbol,
            duration: parseInt(options.duration, 10),
            frequency: parseInt(options.frequency, 10),
            reduceOnly: options.reduceOnly,
            clientOrderId: options.clientId,
          });

          const result = await placeTwapOrder(params, dexOpts(options));

          formatOutput(
            result,
            (r) => {
              printSuccess(`TWAP order placed successfully`);
              console.log(`Order ID: ${r.orderId ?? "N/A"}`);
              console.log(`Transaction: ${r.transactionHash}`);
            },
            options,
          );
        } catch (error) {
          printError(error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      },
    );

  // Close position
  trade
    .command("close <symbol>")
    .description("Close an open position")
    .option("--json", "Output in JSON format")
    .option("--network <network>", "Network to use (testnet, netna, local)")
    .option("--account <alias>", "Use specific account")
    .option("--slippage <pct>", "Slippage percentage for market close", "1")
    .option("--size <size>", "Partial close size (default: full position)")
    .option("--encrypt", "Submit as encrypted (mempool-private) transaction")
    .action(
      async (
        symbol: string,
        options: TradeCommandOptions & {
          slippage?: string;
          size?: string;
        },
      ) => {
        try {
          const params = ClosePositionSchema.parse({
            symbol,
            slippage: options.slippage ? parseFloat(options.slippage) : undefined,
            size: options.size ? parseFloat(options.size) : undefined,
          });

          const { isLong, closeSize, limitPrice, orderResult } = await closePosition(
            params,
            dexOpts(options),
          );

          console.log(
            `Closing ${isLong ? "LONG" : "SHORT"} position: ${closeSize} ${symbol} at ~${formatPrice(limitPrice)}`,
          );

          formatOutput(
            orderResult,
            (r) => {
              if (r.success) {
                printSuccess(`Position closed successfully`);
                console.log(`Transaction: ${r.transactionHash}`);
              } else {
                printError(`Close failed: ${r.error}`);
              }
            },
            options,
          );

          if (!orderResult.success) {
            process.exit(1);
          }
        } catch (error) {
          printError(error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      },
    );

  // Cancel order
  trade
    .command("cancel <orderId>")
    .description("Cancel an order")
    .requiredOption("--market <symbol>", "Market symbol")
    .option("--json", "Output in JSON format")
    .option("--network <network>", "Network to use (testnet, netna, local)")
    .option("--account <alias>", "Use specific account")
    .option("--encrypt", "Submit as encrypted (mempool-private) transaction")
    .action(async (orderId: string, options: TradeCommandOptions & { market: string }) => {
      try {
        const params = CancelOrderSchema.parse({ orderId, symbol: options.market });

        const result = await cancelOrder(params, dexOpts(options));

        formatOutput(
          result,
          () => {
            printSuccess(`Order ${orderId} cancelled`);
            console.log(`Transaction: ${result.transactionHash}`);
          },
          options,
        );
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // Cancel TWAP order
  trade
    .command("cancel-twap <orderId>")
    .description("Cancel a TWAP order")
    .requiredOption("--market <symbol>", "Market symbol")
    .option("--json", "Output in JSON format")
    .option("--network <network>", "Network to use (testnet, netna, local)")
    .option("--account <alias>", "Use specific account")
    .option("--encrypt", "Submit as encrypted (mempool-private) transaction")
    .action(async (orderId: string, options: TradeCommandOptions & { market: string }) => {
      try {
        const params = CancelTwapOrderSchema.parse({ orderId, symbol: options.market });

        const result = await cancelTwapOrder(params, dexOpts(options));

        formatOutput(
          result,
          () => {
            printSuccess(`TWAP order ${orderId} cancelled`);
            console.log(`Transaction: ${result.transactionHash}`);
          },
          options,
        );
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // Cancel all orders
  trade
    .command("cancel-all")
    .description("Cancel all open orders")
    .option("--market <symbol>", "Only cancel orders for specific market")
    .option("--json", "Output in JSON format")
    .option("--network <network>", "Network to use (testnet, netna, local)")
    .option("--account <alias>", "Use specific account")
    .option("-y, --yes", "Skip confirmation")
    .option("--encrypt", "Submit as encrypted (mempool-private) transaction")
    .action(async (options: TradeCommandOptions & { market?: string; yes?: boolean }) => {
      try {
        // Preview how many orders will be cancelled
        const opts = dexOpts(options);
        const subaccountAddr = resolveSubaccountAddress(opts);
        const readDex = createReadDex(opts);
        const ordersResponse = await readDex.userOpenOrders.getByAddr({ subAddr: subaccountAddr });
        let orderCount = ordersResponse.items.length;

        if (options.market) {
          const markets = await readDex.markets.getAll();
          const market = markets.find(
            (m) => m.market_name.toLowerCase() === options.market?.toLowerCase(),
          );
          if (market) {
            orderCount = ordersResponse.items.filter(
              (o) => o.market.toLowerCase() === market.market_addr.toLowerCase(),
            ).length;
          }
        }

        if (orderCount === 0) {
          console.log("No open orders to cancel");
          return;
        }

        if (!options.yes) {
          const confirm = (await inquirer.prompt([
            {
              type: "confirm",
              name: "confirm",
              message: `Cancel ${orderCount} order(s)?`,
              default: false,
            },
          ])) as { confirm: boolean };
          if (!confirm.confirm) {
            console.log("Cancelled");
            return;
          }
        }

        const params = CancelAllOrdersSchema.parse({ symbol: options.market });
        const result = await cancelAllOrders(params, opts);

        formatOutput(
          result,
          (r) => {
            printSuccess(`Cancelled ${r.cancelled} order(s)`);
            if (r.failed > 0) {
              printError(`Failed to cancel ${r.failed} order(s)`);
            }
          },
          options,
        );
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // set-leverage and set-margin deliberately have no --encrypt flag: they route
  // to configureUserSettingsForMarket, a config change the SDK submits plaintext
  // (like deposits/withdrawals). Encryption targets front-run-sensitive orders,
  // so advertising --encrypt here would silently no-op.

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
        options: TradeCommandOptions & { cross?: boolean; isolated?: boolean },
      ) => {
        try {
          const params = SetLeverageSchema.parse({
            symbol,
            leverage: parseInt(leverage, 10),
            marginType: options.isolated ? "isolated" : "cross",
          });

          const result = await setLeverage(params, dexOpts(options));

          formatOutput(
            result,
            (r) => {
              printSuccess(`Leverage set to ${r.leverage}x (${r.marginType}) for ${r.symbol}`);
            },
            options,
          );
        } catch (error) {
          printError(error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      },
    );

  // Set margin type
  trade
    .command("set-margin <symbol> <type>")
    .description("Switch margin type for a market (cross or isolated)")
    .option("--json", "Output in JSON format")
    .option("--network <network>", "Network to use (testnet, netna, local)")
    .option("--account <alias>", "Use specific account")
    .action(async (symbol: string, type: string, options: TradeCommandOptions) => {
      try {
        const params = SetMarginTypeSchema.parse({ symbol, marginType: type });

        const result = await setMarginType(params, dexOpts(options));

        formatOutput(
          result,
          (r) => {
            printSuccess(
              `Margin type set to ${r.marginType} for ${r.symbol} (leverage: ${r.leverage}x)`,
            );
          },
          options,
        );
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // TP/SL subcommand group
  const tpsl = trade.command("tp-sl").description("Manage take-profit and stop-loss orders");

  // Place TP/SL
  tpsl
    .command("set <symbol>")
    .description("Set take-profit and/or stop-loss for a position")
    .option("--json", "Output in JSON format")
    .option("--network <network>", "Network to use (testnet, netna, local)")
    .option("--account <alias>", "Use specific account")
    .option("--tp-trigger <price>", "Take-profit trigger price")
    .option("--tp-limit <price>", "Take-profit limit price")
    .option("--tp-size <size>", "Take-profit size (omit for full position)")
    .option("--sl-trigger <price>", "Stop-loss trigger price")
    .option("--sl-limit <price>", "Stop-loss limit price")
    .option("--sl-size <size>", "Stop-loss size (omit for full position)")
    .option("--encrypt", "Submit as encrypted (mempool-private) transaction")
    .action(
      async (
        symbol: string,
        options: TradeCommandOptions & {
          tpTrigger?: string;
          tpLimit?: string;
          tpSize?: string;
          slTrigger?: string;
          slLimit?: string;
          slSize?: string;
        },
      ) => {
        try {
          const params = PlaceTpSlSchema.parse({
            symbol,
            tpTriggerPrice: options.tpTrigger ? parseFloat(options.tpTrigger) : undefined,
            tpLimitPrice: options.tpLimit ? parseFloat(options.tpLimit) : undefined,
            tpSize: options.tpSize ? parseFloat(options.tpSize) : undefined,
            slTriggerPrice: options.slTrigger ? parseFloat(options.slTrigger) : undefined,
            slLimitPrice: options.slLimit ? parseFloat(options.slLimit) : undefined,
            slSize: options.slSize ? parseFloat(options.slSize) : undefined,
          });

          const result = await placeTpSl(params, dexOpts(options));

          formatOutput(
            result,
            () => {
              printSuccess(`TP/SL set for ${symbol}`);
              console.log(`Transaction: ${result.transactionHash}`);
            },
            options,
          );
        } catch (error) {
          printError(error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      },
    );

  // Cancel TP/SL
  tpsl
    .command("cancel <orderId>")
    .description("Cancel a TP/SL order")
    .requiredOption("--market <symbol>", "Market symbol")
    .option("--json", "Output in JSON format")
    .option("--network <network>", "Network to use (testnet, netna, local)")
    .option("--account <alias>", "Use specific account")
    .option("--encrypt", "Submit as encrypted (mempool-private) transaction")
    .action(async (orderId: string, options: TradeCommandOptions & { market: string }) => {
      try {
        const params = CancelTpSlSchema.parse({ orderId, symbol: options.market });

        const result = await cancelTpSl(params, dexOpts(options));

        formatOutput(
          result,
          () => {
            printSuccess(`TP/SL order ${orderId} cancelled`);
            console.log(`Transaction: ${result.transactionHash}`);
          },
          options,
        );
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // List TP/SL
  tpsl
    .command("ls <symbol>")
    .description("List TP/SL orders for a position")
    .option("--json", "Output in JSON format")
    .option("--network <network>", "Network to use (testnet, netna, local)")
    .option("--account <alias>", "Use specific account")
    .action(async (symbol: string, options: TradeCommandOptions) => {
      try {
        const params = GetTpSlSchema.parse({ symbol });
        const data = await getTpSl(params, dexOpts(options));

        formatOutput(
          data,
          (d) => {
            if (!d.position) {
              console.log(`No open position for ${d.symbol}`);
              return;
            }

            const pos = d.position;
            const side = pos.size > 0 ? "LONG" : "SHORT";
            console.log(
              `${d.symbol} ${side} ${formatNumber(Math.abs(pos.size), 4)} @ ${formatPrice(pos.entryPrice)}\n`,
            );

            // Position-level TP/SL
            if (pos.tpTriggerPrice || pos.slTriggerPrice) {
              console.log("Position TP/SL:");
              const posTable = createTable(["Type", "Trigger", "Limit", "Order ID"]);
              if (pos.tpTriggerPrice) {
                posTable.push([
                  "Take Profit",
                  formatPrice(pos.tpTriggerPrice),
                  pos.tpLimitPrice ? formatPrice(pos.tpLimitPrice) : "-",
                  pos.tpOrderId ?? "-",
                ]);
              }
              if (pos.slTriggerPrice) {
                posTable.push([
                  "Stop Loss",
                  formatPrice(pos.slTriggerPrice),
                  pos.slLimitPrice ? formatPrice(pos.slLimitPrice) : "-",
                  pos.slOrderId ?? "-",
                ]);
              }
              console.log(posTable.toString());
            }

            // Fixed-size TP/SL orders
            if (d.orders.length > 0) {
              console.log("\nFixed-size TP/SL orders:");
              const orderTable = createTable(["Order ID", "Type", "Side", "Size", "Trigger"]);
              for (const o of d.orders) {
                orderTable.push([
                  formatAddress(o.orderId, 4),
                  o.orderType ?? "-",
                  formatSide(o.side),
                  formatNumber(o.size ?? 0, 4),
                  o.triggerCondition ?? "-",
                ]);
              }
              console.log(orderTable.toString());
            }

            if (!pos.tpTriggerPrice && !pos.slTriggerPrice && d.orders.length === 0) {
              console.log("No TP/SL orders set");
            }
          },
          options,
        );
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

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
        const opts = dexOpts(options);

        if (options.watch) {
          console.log("Watching positions... (Ctrl+C to stop)\n");

          const subaccountAddr = resolveSubaccountAddress(opts);
          const readDex = createReadDex(opts);

          const unsubscribe = readDex.userPositions.subscribeByAddr(subaccountAddr, (data) => {
            console.clear();
            console.log(`Positions - ${new Date().toLocaleTimeString()}\n`);
            renderPositions(data.positions);
          });

          process.on("SIGINT", () => {
            unsubscribe();
            console.log("\n");
            process.exit(0);
          });

          // eslint-disable-next-line @typescript-eslint/no-empty-function
          await new Promise(() => {});
        } else {
          const { positions } = await getPositions(opts);

          formatOutput(positions, (pos) => renderPositions(pos), options);
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
        const opts = dexOpts(options);

        if (options.watch) {
          console.log("Watching orders... (Ctrl+C to stop)\n");

          const subaccountAddr = resolveSubaccountAddress(opts);
          const readDex = createReadDex(opts);

          const unsubscribe = readDex.userOpenOrders.subscribeByAddr(subaccountAddr, (data) => {
            console.clear();
            console.log(`Open Orders - ${new Date().toLocaleTimeString()}\n`);
            renderOrders(data.orders);
          });

          process.on("SIGINT", () => {
            unsubscribe();
            console.log("\n");
            process.exit(0);
          });

          // eslint-disable-next-line @typescript-eslint/no-empty-function
          await new Promise(() => {});
        } else {
          const { orders } = await getOrders(opts);

          formatOutput(orders.items, (ord) => renderOrders(ord), options);
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
        const params = GetTradeHistorySchema.parse({
          limit: options.limit ? parseInt(options.limit, 10) : undefined,
        });

        const { trades } = await getTradeHistory(params, dexOpts(options));

        formatOutput(
          trades,
          (tradeList) => {
            if (tradeList.length === 0) {
              console.log("No trade history");
              return;
            }

            const table = createTable(["Time", "Market", "Action", "Size", "Price", "Fee", "PnL"]);

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
          options,
        );
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // Order history
  trade
    .command("order-history")
    .description("View order history (all order states)")
    .option("--json", "Output in JSON format")
    .option("--network <network>", "Network to use (testnet, netna, local)")
    .option("--account <alias>", "Use specific account")
    .option("--limit <limit>", "Number of orders to show", "20")
    .action(async (options: TradeCommandOptions & { limit?: string }) => {
      try {
        const params = GetOrderHistorySchema.parse({
          limit: options.limit ? parseInt(options.limit, 10) : undefined,
        });

        const { orders } = await getOrderHistory(params, dexOpts(options));

        formatOutput(
          orders,
          (orderList) => {
            if (orderList.length === 0) {
              console.log("No order history");
              return;
            }

            const table = createTable([
              "Time",
              "Market",
              "Side",
              "Type",
              "Size",
              "Price",
              "Status",
            ]);

            for (const o of orderList) {
              table.push([
                new Date(o.unix_ms).toLocaleString(),
                formatAddress(o.market, 6),
                formatSide(o.is_buy ? "buy" : "sell"),
                o.order_type || "limit",
                formatNumber(o.orig_size ?? 0, 4),
                formatPrice(o.price ?? 0),
                o.status,
              ]);
            }
            console.log(table.toString());
          },
          options,
        );
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // Active TWAPs
  trade
    .command("active-twaps")
    .description("View active TWAP orders")
    .option("--json", "Output in JSON format")
    .option("--network <network>", "Network to use (testnet, netna, local)")
    .option("--account <alias>", "Use specific account")
    .action(async (options: TradeCommandOptions) => {
      try {
        const { twaps } = await getActiveTwaps(dexOpts(options));

        formatOutput(
          twaps,
          (twapList) => {
            if (twapList.length === 0) {
              console.log("No active TWAP orders");
              return;
            }

            const table = createTable([
              "Order ID",
              "Market",
              "Side",
              "Orig Size",
              "Remaining",
              "Duration",
              "Frequency",
              "Status",
            ]);

            for (const t of twapList) {
              table.push([
                formatAddress(t.order_id, 4),
                formatAddress(t.market, 6),
                formatSide(t.is_buy ? "buy" : "sell"),
                formatNumber(t.orig_size, 4),
                formatNumber(t.remaining_size, 4),
                `${t.duration_s}s`,
                `${t.frequency_s}s`,
                t.status,
              ]);
            }
            console.log(table.toString());
          },
          options,
        );
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // TWAP history
  trade
    .command("twap-history")
    .description("View TWAP order history")
    .option("--json", "Output in JSON format")
    .option("--network <network>", "Network to use (testnet, netna, local)")
    .option("--account <alias>", "Use specific account")
    .option("--limit <limit>", "Number of TWAP orders to show", "20")
    .action(async (options: TradeCommandOptions & { limit?: string }) => {
      try {
        const params = GetTwapHistorySchema.parse({
          limit: options.limit ? parseInt(options.limit, 10) : undefined,
        });

        const { twaps } = await getTwapHistory(params, dexOpts(options));

        formatOutput(
          twaps,
          (twapList) => {
            if (twapList.length === 0) {
              console.log("No TWAP history");
              return;
            }

            const table = createTable([
              "Time",
              "Market",
              "Side",
              "Orig Size",
              "Remaining",
              "Duration",
              "Frequency",
              "Status",
            ]);

            for (const t of twapList) {
              table.push([
                new Date(t.transaction_unix_ms).toLocaleString(),
                formatAddress(t.market, 6),
                formatSide(t.is_buy ? "buy" : "sell"),
                formatNumber(t.orig_size, 4),
                formatNumber(t.remaining_size, 4),
                `${t.duration_s}s`,
                `${t.frequency_s}s`,
                t.status,
              ]);
            }
            console.log(table.toString());
          },
          options,
        );
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // Funding history
  trade
    .command("funding-history")
    .description("View funding rate payment history")
    .option("--json", "Output in JSON format")
    .option("--network <network>", "Network to use (testnet, netna, local)")
    .option("--account <alias>", "Use specific account")
    .option("--limit <limit>", "Number of records to show", "20")
    .action(async (options: TradeCommandOptions & { limit?: string }) => {
      try {
        const params = GetFundingHistorySchema.parse({
          limit: options.limit ? parseInt(options.limit, 10) : undefined,
        });

        const { funding } = await getFundingHistory(params, dexOpts(options));

        formatOutput(
          funding,
          (fundingList) => {
            if (fundingList.length === 0) {
              console.log("No funding history");
              return;
            }

            const table = createTable([
              "Time",
              "Market",
              "Action",
              "Size",
              "Funding",
              "Fee",
              "Rebate",
            ]);

            for (const f of fundingList) {
              table.push([
                new Date(f.transaction_unix_ms).toLocaleString(),
                formatAddress(f.market, 6),
                f.action,
                formatNumber(f.size, 4),
                formatPnL(f.realized_funding_amount),
                formatNumber(f.fee_amount, 4),
                f.is_rebate ? "Yes" : "No",
              ]);
            }
            console.log(table.toString());
          },
          options,
        );
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  return trade;
}

interface Position {
  market?: string;
  market_name?: string;
  size: number;
  entry_price: number;
  mark_price?: number;
  unrealized_pnl?: number;
  leverage?: number;
  liquidation_price?: number;
}

interface Order {
  order_id: string;
  market: string;
  is_buy: boolean;
  remaining_size?: number | null;
  price?: number | null;
  orig_size?: number | null;
  order_type?: string;
  details?: string;
}

function renderPositions(positions: Position[]): void {
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
      p.market_name || p.market || "Unknown",
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

function renderOrders(orders: Order[]): void {
  if (orders.length === 0) {
    console.log("No open orders");
    return;
  }

  const table = createTable(["ID", "Market", "Side", "Size", "Price", "Filled", "Type", "Status"]);

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
