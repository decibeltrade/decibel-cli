import { Command } from "commander";
import inquirer from "inquirer";

import {
  cancelAllSpotOrders,
  CancelAllSpotOrdersSchema,
  cancelSpotOrder,
  CancelSpotOrderSchema,
  fetchMarketNames,
  getSpotBalances,
  getSpotMarkets,
  getSpotOrderbook,
  GetSpotOrderbookSchema,
  getSpotOrderHistory,
  GetSpotOrderHistorySchema,
  getSpotOrders,
  getSpotPrice,
  GetSpotPriceSchema,
  getSpotTradeHistory,
  GetSpotTradeHistorySchema,
  placeSpotLimitOrder,
  PlaceSpotLimitOrderSchema,
  placeSpotMarketOrder,
  PlaceSpotMarketOrderSchema,
} from "../../actions/index.js";
import { fetchSpotOpenOrders, findSpotMarket } from "../../actions/spot-utils.js";
import { createReadDex, DexOptions, resolveSubaccountAddress } from "../../services/dex-factory.js";
import { NetworkName } from "../../utils/config.js";
import {
  createTable,
  formatAddress,
  formatAmount,
  formatNumber,
  formatOutput,
  formatPnL,
  formatPrice,
  formatSide,
  formatUsd,
  marketLabel,
  OutputOptions,
  printError,
  printInfo,
  printSuccess,
  printWarning,
  renderOrderbook,
} from "../../utils/output.js";

interface SpotCommandOptions extends OutputOptions {
  network?: NetworkName;
  account?: string;
  watch?: boolean;
  encrypt?: boolean;
}

function dexOpts(options: SpotCommandOptions): DexOptions {
  return { network: options.network, accountAlias: options.account, encrypt: options.encrypt };
}

/**
 * Spot placement is async when funding needs a rate-limited CBS withdrawal.
 *
 * The order is placed later, when the queue drains — so where to look for the
 * outcome depends on the time-in-force. Only a resting order (GTC/post-only)
 * shows up in `spot orders`; an IOC fills or cancels the moment it is placed
 * and never rests, so an empty open-orders list would be indistinguishable
 * from "still queued". Order history is the one view that covers both.
 */
function printPendingCbsNotice(orderId: string | undefined, restsWhenPlaced: boolean): void {
  const id = orderId ?? "the order";
  printWarning("Spot order QUEUED, not placed");
  printInfo(
    `Order ${id} is queued behind a rate-limited collateral withdrawal and is not on the book yet.`,
  );
  console.log(
    `  decibel-cli spot order-history   # final state of order ${id}\n` +
      `  decibel-cli spot history         # fills, if it executed`,
  );
  if (restsWhenPlaced) {
    console.log("  decibel-cli spot orders          # it appears here once it rests");
  } else {
    console.log(
      "  Note: this order is IOC — it fills or cancels on placement and never\n" +
        '  appears in "spot orders", so an empty list there means nothing.',
    );
  }
}

export function createSpotCommand(): Command {
  const spot = new Command("spot").description("Spot trading commands");

  const order = spot.command("order").description("Place spot orders");

  // Spot orders have no reduce-only, TP/SL, TWAP or client order id on chain,
  // so those flags are deliberately absent rather than accepted and ignored.
  order
    .command("limit <side> <size> <symbol> <price>")
    .description("Place a spot limit order")
    .option("--json", "Output in JSON format")
    .option("--network <network>", "Network to use (mainnet, testnet, local)")
    .option("--account <alias>", "Use specific account")
    .option("--tif <tif>", "Time in force: gtc, post-only, ioc", "gtc")
    .option("--encrypt", "Submit as encrypted (mempool-private) transaction")
    .action(
      async (
        side: string,
        size: string,
        symbol: string,
        price: string,
        options: SpotCommandOptions & { tif?: string },
      ) => {
        try {
          const params = PlaceSpotLimitOrderSchema.parse({
            side,
            size: parseFloat(size),
            symbol,
            price: parseFloat(price),
            timeInForce: options.tif,
          });

          const result = await placeSpotLimitOrder(params, dexOpts(options));

          formatOutput(
            result,
            (r) => {
              if (!r.success) {
                printError(`Order failed: ${r.error}`);
                return;
              }
              // Only the funding transaction landed when pendingCbs is set —
              // the order is not on the book, so do not call it placed.
              if (r.pendingCbs) {
                printPendingCbsNotice(r.orderId, params.timeInForce !== "ioc");
              } else {
                printSuccess("Spot order placed successfully");
                console.log(`Order ID: ${r.orderId ?? "N/A"}`);
              }
              console.log(`Transaction: ${r.transactionHash}`);
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

  order
    .command("market <side> <size> <symbol>")
    .description("Place a spot market order (IOC limit at the slippage cap)")
    .option("--json", "Output in JSON format")
    .option("--network <network>", "Network to use (mainnet, testnet, local)")
    .option("--account <alias>", "Use specific account")
    .option("--slippage <pct>", "Slippage percentage", "1")
    .option("--encrypt", "Submit as encrypted (mempool-private) transaction")
    .action(
      async (
        side: string,
        size: string,
        symbol: string,
        options: SpotCommandOptions & { slippage?: string },
      ) => {
        try {
          const params = PlaceSpotMarketOrderSchema.parse({
            side,
            size: parseFloat(size),
            symbol,
            slippage: options.slippage ? parseFloat(options.slippage) : undefined,
          });

          const result = await placeSpotMarketOrder(params, dexOpts(options));

          formatOutput(
            result,
            (r) => {
              console.log(
                `Reference price ${formatPrice(r.referencePrice)}, submitting at ${formatPrice(r.limitPrice)}`,
              );
              if (!r.success) {
                printError(`Order failed: ${r.error}`);
                return;
              }
              if (r.pendingCbs) {
                printPendingCbsNotice(r.orderId, false);
              } else {
                printSuccess("Spot market order placed successfully");
                console.log(`Order ID: ${r.orderId ?? "N/A"}`);
              }
              console.log(`Transaction: ${r.transactionHash}`);
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

  spot
    .command("cancel <orderId>")
    .description("Cancel a spot order")
    .requiredOption("--market <symbol>", "Spot market symbol")
    .option("--json", "Output in JSON format")
    .option("--network <network>", "Network to use (mainnet, testnet, local)")
    .option("--account <alias>", "Use specific account")
    .option("--encrypt", "Submit as encrypted (mempool-private) transaction")
    .action(async (orderId: string, options: SpotCommandOptions & { market: string }) => {
      try {
        const params = CancelSpotOrderSchema.parse({ orderId, symbol: options.market });

        const result = await cancelSpotOrder(params, dexOpts(options));

        formatOutput(
          result,
          (r) => {
            printSuccess(`Spot order ${orderId} cancelled`);
            console.log(`Transaction: ${r.transactionHash}`);
            if (!r.marketNameVerified) {
              printWarning(
                `Could not confirm "${options.market}" against the market list — the symbol was used as typed.`,
              );
            }
          },
          options,
        );
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  spot
    .command("cancel-all")
    .description("Cancel all open spot orders")
    .option("--market <symbol>", "Only cancel orders for a specific spot market")
    .option("--json", "Output in JSON format")
    .option("--network <network>", "Network to use (mainnet, testnet, local)")
    .option("--account <alias>", "Use specific account")
    .option("-y, --yes", "Skip confirmation")
    .option("--encrypt", "Submit as encrypted (mempool-private) transaction")
    .action(async (options: SpotCommandOptions & { market?: string; yes?: boolean }) => {
      try {
        const params = CancelAllSpotOrdersSchema.parse({ symbol: options.market });

        if (!options.yes) {
          const opts = dexOpts(options);
          const readDex = createReadDex(opts);
          // Same paginated fetch the cancellation itself uses, so the count in
          // the prompt matches the number of orders actually cancelled.
          const { orders: items, truncated } = await fetchSpotOpenOrders(
            readDex,
            resolveSubaccountAddress(opts),
          );

          let orderCount = items.length;
          if (params.symbol) {
            // Treating a failed lookup as "zero orders" made a typo look like
            // an empty book.
            const market = await findSpotMarket(readDex, params.symbol);
            orderCount = items.filter(
              (o) => o.market.toLowerCase() === market.market_addr.toLowerCase(),
            ).length;
          }

          if (orderCount === 0) {
            // "None" is only true when the whole book was visible. Behind a
            // full window there may be matching orders we simply cannot see.
            if (truncated) {
              throw new Error(
                `No orders on ${params.symbol} are visible, but this subaccount has more open spot orders than the API can page through, and the market filter is applied client-side. Matching orders may exist beyond the pagination window and cannot be reached by a filtered cancel. Cancel them individually with "decibel-cli spot cancel <orderId> --market ${params.symbol}". ("decibel-cli spot cancel-all" with no --market would reach them, but it also cancels your orders on every other market.)`,
              );
            }
            console.log("No open spot orders to cancel");
            return;
          }

          // More orders exist than one sweep can page to, so the count is a
          // floor. Cancellation makes further passes to clear the rest.
          const countLabel = truncated ? `at least ${orderCount}` : `${orderCount}`;
          const confirm = (await inquirer.prompt([
            {
              type: "confirm",
              name: "confirm",
              message: `Cancel ${countLabel} spot order(s)?`,
              default: false,
            },
          ])) as { confirm: boolean };
          if (!confirm.confirm) {
            console.log("Cancelled");
            return;
          }
        }

        const result = await cancelAllSpotOrders(params, dexOpts(options));

        formatOutput(
          result,
          (r) => {
            if (r.total === 0) {
              console.log("No open spot orders to cancel");
              return;
            }
            printSuccess(`Cancelled ${r.cancelled} spot order(s)`);
            if (r.failed > 0) {
              printError(`Failed to cancel ${r.failed} spot order(s)`);
            }
            // A CBS-queued order is live from the user's point of view but
            // absent from the open-orders feed, so no sweep can reach it. It
            // drains and executes later — say so rather than let "cancelled N"
            // read as "flat".
            printWarning(
              "This does not cover orders queued behind a collateral withdrawal (pendingCbs).",
            );
            console.log(
              "  They are not in the open-orders feed. Cancel one by id with\n" +
                '  "decibel-cli spot cancel <orderId> --market <symbol>", which does reach them.',
            );
          },
          options,
        );
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  spot
    .command("orders")
    .description("View open spot orders")
    .option("--json", "Output in JSON format")
    .option("--network <network>", "Network to use (mainnet, testnet, local)")
    .option("--account <alias>", "Use specific account")
    .option("-w, --watch", "Watch orders in real-time")
    .action(async (options: SpotCommandOptions) => {
      try {
        const opts = dexOpts(options);

        if (options.watch) {
          console.log("Watching spot orders... (Ctrl+C to stop)\n");

          const readDex = createReadDex(opts);
          // Names are stable, so one lookup serves every tick.
          const names = await fetchMarketNames(readDex);
          // The open-orders topic serves both products, demuxed per row.
          const unsubscribe = readDex.userOpenOrders.subscribeByAddr(
            resolveSubaccountAddress(opts),
            (data) => {
              console.clear();
              console.log(`Open Spot Orders - ${new Date().toLocaleTimeString()}\n`);
              renderSpotOrders(
                data.orders.filter((o) => o.asset_type === "spot"),
                names,
              );
            },
          );

          process.on("SIGINT", () => {
            unsubscribe();
            console.log("\n");
            process.exit(0);
          });

          // eslint-disable-next-line @typescript-eslint/no-empty-function
          await new Promise(() => {});
        } else {
          const [{ orders, truncated }, names] = await Promise.all([
            getSpotOrders(opts),
            options.json ? undefined : fetchMarketNames(createReadDex(opts)),
          ]);
          formatOutput(
            { orders, truncated },
            (d) => {
              renderSpotOrders(d.orders, names);
              if (d.truncated) {
                printWarning(
                  `Showing the first ${d.orders.length} open orders — this subaccount has more than pagination can reach.`,
                );
              }
            },
            options,
          );
        }
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  spot
    .command("balances")
    .description("View spot holdings and open-order reservations")
    .option("--json", "Output in JSON format")
    .option("--network <network>", "Network to use (mainnet, testnet, local)")
    .option("--account <alias>", "Use specific account")
    .action(async (options: SpotCommandOptions) => {
      try {
        const data = await getSpotBalances(dexOpts(options));

        formatOutput(
          data,
          (d) => {
            const isFlat = d.positions.length === 0 && d.inFlightOrders.length === 0;
            if (isFlat) {
              // Not an early return: an account that sold out and withdrew has
              // no holdings but still has lifetime metrics worth showing.
              console.log("No current spot holdings");
            }

            if (d.positions.length > 0) {
              // "Entry Notional", not "Avg Cost": this is the total recorded
              // cost basis of the costed units, not a per-unit average, and
              // uncosted units (e.g. a plain FA transfer in) mean dividing by
              // `amount` would not recover one either.
              const table = createTable(["Asset", "Amount", "USD Value", "Entry Notional", "uPnL"]);
              for (const p of d.positions) {
                table.push([
                  p.symbol || formatAddress(p.assetAddress),
                  formatNumber(p.amount, 6),
                  formatUsd(p.usdValue),
                  p.entryNotionalUsd > 0 ? formatUsd(p.entryNotionalUsd) : "-",
                  formatPnL(p.unrealizedPnlUsd),
                ]);
              }
              console.log(table.toString());
            }

            if (!isFlat) {
              console.log(`\nTotal: ${formatUsd(d.totalUsd)}`);
              if (d.unrealizedPnlUsd != null) {
                console.log(`Unrealized PnL: ${formatPnL(d.unrealizedPnlUsd)}`);
              }
            }

            if (d.inFlightOrders.length > 0) {
              console.log("\nReserved by open orders:");
              const table = createTable(["Order ID", "Side", "Asset", "Amount", "USD Value"]);
              for (const o of d.inFlightOrders) {
                table.push([
                  formatAddress(o.orderId, 4),
                  formatSide(o.isBid ? "buy" : "sell"),
                  formatAddress(o.reservedAsset),
                  formatNumber(o.reservedAmount, 6),
                  formatUsd(o.reservedUsdValue),
                ]);
              }
              console.log(table.toString());
            }

            if (d.metrics) {
              console.log("\nLifetime:");
              const table = createTable(["Metric", "Value"]);
              table.push(["Volume", formatUsd(d.metrics.cumulativeVolumeUsd)]);
              table.push(["Taker Fees", formatUsd(d.metrics.cumulativeTakerFeesUsd)]);
              table.push(["Maker Fees", formatUsd(d.metrics.cumulativeMakerFeesUsd)]);
              table.push(["Realized PnL", formatPnL(d.metrics.cumulativeRealizedPnlUsd)]);
              console.log(table.toString());
            }
          },
          options,
        );
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  const markets = spot.command("markets").description("View spot market information");

  markets
    .command("ls")
    .description("List all available spot markets")
    .option("--json", "Output in JSON format")
    .option("--network <network>", "Network to use (mainnet, testnet, local)")
    .action(async (options: SpotCommandOptions) => {
      try {
        const result = await getSpotMarkets({ network: options.network });

        formatOutput(
          result.markets,
          (list) => {
            if (list.length === 0) {
              console.log("No spot markets available");
              return;
            }
            // Human units, matching what the order commands take — the raw
            // chain values are orders of magnitude larger and are only in the
            // --json output.
            const table = createTable(["Market", "Tick Size", "Min Size", "Lot Size", "Mode"]);
            for (const m of list) {
              table.push([
                m.name,
                formatAmount(m.tickSize, m.quoteDecimals),
                formatAmount(m.minSize, m.baseDecimals),
                formatAmount(m.lotSize, m.baseDecimals),
                m.mode,
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

  spot
    .command("price <symbol>")
    .description("Get current price and 24h stats for a spot market")
    .option("--json", "Output in JSON format")
    .option("--network <network>", "Network to use (mainnet, testnet, local)")
    .action(async (symbol: string, options: SpotCommandOptions) => {
      try {
        const params = GetSpotPriceSchema.parse({ symbol });
        const data = await getSpotPrice(params, { network: options.network });

        formatOutput(
          data,
          (d) => {
            const table = createTable(["Property", "Value"]);
            table.push(["Symbol", d.symbol]);
            table.push(["Last Price", d.lastPrice != null ? formatPrice(d.lastPrice) : "n/a"]);
            table.push(["Mid Price", d.midPrice != null ? formatPrice(d.midPrice) : "n/a"]);
            table.push([
              "24h Change",
              d.change24hPct != null ? `${formatNumber(d.change24hPct, 2)}%` : "n/a",
            ]);
            table.push(["24h High", d.high24h != null ? formatPrice(d.high24h) : "n/a"]);
            table.push(["24h Low", d.low24h != null ? formatPrice(d.low24h) : "n/a"]);
            table.push(["24h Volume (base)", formatNumber(d.volume24hBase, 4)]);
            table.push(["24h Volume (quote)", formatUsd(d.volume24hQuote)]);
            console.log(table.toString());
          },
          options,
        );
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  spot
    .command("book <symbol>")
    .description("View the order book for a spot market")
    .option("--json", "Output in JSON format")
    .option("--network <network>", "Network to use (mainnet, testnet, local)")
    .option("--depth <depth>", "Number of levels to show", "10")
    .action(async (symbol: string, options: SpotCommandOptions & { depth?: string }) => {
      try {
        const params = GetSpotOrderbookSchema.parse({
          symbol,
          depth: parseInt(options.depth || "10", 10),
        });
        const data = await getSpotOrderbook(params, { network: options.network });

        formatOutput(
          data,
          (d) => {
            console.log(`${d.symbol} Order Book\n`);
            renderOrderbook(d.asks, d.bids);
            if (d.spread != null) {
              console.log(`\nSpread: ${formatPrice(d.spread)} (${d.spreadPercent?.toFixed(3)}%)`);
            }
          },
          options,
        );
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  spot
    .command("history")
    .description("View spot trade history")
    .option("--json", "Output in JSON format")
    .option("--network <network>", "Network to use (mainnet, testnet, local)")
    .option("--account <alias>", "Use specific account")
    .option("--limit <limit>", "Number of trades to show", "20")
    .action(async (options: SpotCommandOptions & { limit?: string }) => {
      try {
        const params = GetSpotTradeHistorySchema.parse({
          limit: options.limit ? parseInt(options.limit, 10) : undefined,
        });

        const opts = dexOpts(options);
        const [{ trades }, names] = await Promise.all([
          getSpotTradeHistory(params, opts),
          options.json ? undefined : fetchMarketNames(createReadDex(opts)),
        ]);

        formatOutput(
          trades,
          (list) => {
            if (list.length === 0) {
              console.log("No spot trade history");
              return;
            }

            const table = createTable(["Time", "Market", "Action", "Size", "Price", "Fee"]);
            for (const t of list) {
              table.push([
                new Date(t.transaction_unix_ms).toLocaleString(),
                marketLabel(t.market, names),
                t.action,
                formatNumber(t.size, 6),
                formatPrice(t.price),
                formatNumber(t.fee_amount, 6),
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

  spot
    .command("order-history")
    .description("View spot order history (all order states)")
    .option("--json", "Output in JSON format")
    .option("--network <network>", "Network to use (mainnet, testnet, local)")
    .option("--account <alias>", "Use specific account")
    .option("--limit <limit>", "Number of orders to show", "20")
    .action(async (options: SpotCommandOptions & { limit?: string }) => {
      try {
        const params = GetSpotOrderHistorySchema.parse({
          limit: options.limit ? parseInt(options.limit, 10) : undefined,
        });

        const opts = dexOpts(options);
        const [{ orders }, names] = await Promise.all([
          getSpotOrderHistory(params, opts),
          options.json ? undefined : fetchMarketNames(createReadDex(opts)),
        ]);

        formatOutput(
          orders,
          (list) => {
            if (list.length === 0) {
              console.log("No spot order history");
              return;
            }

            const table = createTable(["Time", "Market", "Side", "Size", "Price", "Status"]);
            for (const o of list) {
              table.push([
                new Date(o.unix_ms).toLocaleString(),
                marketLabel(o.market, names),
                formatSide(o.is_buy ? "buy" : "sell"),
                formatNumber(o.orig_size ?? 0, 6),
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

  return spot;
}

interface SpotOrderRow {
  order_id: string;
  market: string;
  is_buy: boolean;
  remaining_size?: number | null;
  orig_size?: number | null;
  price?: number | null;
  time_in_force?: string;
  details?: string;
}

function renderSpotOrders(orders: SpotOrderRow[], names?: Map<string, string>): void {
  if (orders.length === 0) {
    console.log("No open spot orders");
    return;
  }

  const table = createTable(["ID", "Market", "Side", "Size", "Price", "Filled", "TIF", "Status"]);

  for (const o of orders) {
    const filledSize = (o.orig_size ?? 0) - (o.remaining_size ?? 0);
    table.push([
      formatAddress(o.order_id, 4),
      marketLabel(o.market, names),
      formatSide(o.is_buy ? "buy" : "sell"),
      formatNumber(o.remaining_size ?? 0, 6),
      formatPrice(o.price ?? 0),
      formatNumber(filledSize, 6),
      o.time_in_force || "-",
      o.details ?? "open",
    ]);
  }
  console.log(table.toString());
}
