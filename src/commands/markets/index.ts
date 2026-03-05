import { Command } from "commander";

import { createReadDex } from "../../services/dex-factory.js";
import { NetworkName } from "../../utils/config.js";
import {
  createDepthBar,
  createTable,
  formatNumber,
  formatOutput,
  formatPrice,
  OutputOptions,
  printError,
} from "../../utils/output.js";

interface MarketCommandOptions extends OutputOptions {
  network?: NetworkName;
  watch?: boolean;
}

export function createMarketsCommand(): Command {
  const markets = new Command("markets").description("View market information");

  // List all markets
  markets
    .command("ls")
    .description("List all available markets")
    .option("--json", "Output in JSON format")
    .option("--network <network>", "Network to use (testnet, netna, local)")
    .action(async (options: MarketCommandOptions) => {
      try {
        const readDex = createReadDex({ network: options.network });
        const marketsList = await readDex.markets.getAll();

        const data = marketsList.map((m) => ({
          name: m.market_name,
          address: m.market_addr,
          maxLeverage: m.max_leverage,
          tickSize: m.tick_size,
          minSize: m.min_size,
          lotSize: m.lot_size,
          mode: m.mode,
          szDecimals: m.sz_decimals,
          pxDecimals: m.px_decimals,
        }));

        formatOutput(
          data,
          (markets) => {
            const table = createTable(["Market", "Max Leverage", "Tick Size", "Min Size", "Mode"]);
            for (const m of markets) {
              table.push([
                m.name,
                `${m.maxLeverage}x`,
                formatNumber(m.tickSize, m.pxDecimals),
                formatNumber(m.minSize, m.szDecimals),
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

  // Get price for a market
  markets
    .command("price <symbol>")
    .description("Get current price for a market")
    .option("--json", "Output in JSON format")
    .option("--network <network>", "Network to use (testnet, netna, local)")
    .option("-w, --watch", "Watch price in real-time")
    .action(async (symbol: string, options: MarketCommandOptions) => {
      try {
        const readDex = createReadDex({ network: options.network });

        if (options.watch) {
          console.log(`Watching ${symbol} price... (Ctrl+C to stop)\n`);

          const unsubscribe = readDex.marketPrices.subscribeByName(symbol, (data) => {
            // SDK uses mark_px, oracle_px, funding_rate_bps
            const fundingPct = data.price.funding_rate_bps / 100; // bps to percent
            const line = `${symbol}: ${formatPrice(data.price.mark_px)} | Oracle: ${formatPrice(data.price.oracle_px)} | Funding: ${fundingPct.toFixed(4)}%`;
            process.stdout.write(`\r${line.padEnd(80)}`);
          });

          // Handle graceful shutdown
          process.on("SIGINT", () => {
            unsubscribe();
            console.log("\n");
            process.exit(0);
          });

          // Keep the process running
          // eslint-disable-next-line @typescript-eslint/no-empty-function
          await new Promise(() => {});
        } else {
          const prices = await readDex.marketPrices.getByName({ marketName: symbol });
          const price = prices[0];

          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          if (!price) {
            printError(`No price data found for ${symbol}`);
            process.exit(1);
          }

          const data = {
            symbol,
            markPrice: price.mark_px,
            indexPrice: price.oracle_px,
            fundingRateBps: price.funding_rate_bps,
            openInterest: price.open_interest,
          };

          formatOutput(
            data,
            (d) => {
              const table = createTable(["Property", "Value"]);
              table.push(["Symbol", d.symbol]);
              table.push(["Mark Price", formatPrice(d.markPrice)]);
              table.push(["Oracle Price", formatPrice(d.indexPrice)]);
              table.push(["Funding Rate", `${(d.fundingRateBps / 100).toFixed(4)}%`]);
              table.push(["Open Interest", formatNumber(d.openInterest, 2)]);
              console.log(table.toString());
            },
            options,
          );
        }
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // Get orderbook for a market
  markets
    .command("book <symbol>")
    .description("View order book for a market")
    .option("--json", "Output in JSON format")
    .option("--network <network>", "Network to use (testnet, netna, local)")
    .option("-w, --watch", "Watch orderbook in real-time")
    .option("--depth <depth>", "Number of levels to show", "10")
    .action(async (symbol: string, options: MarketCommandOptions & { depth?: string }) => {
      try {
        const readDex = createReadDex({ network: options.network });
        const depth = parseInt(options.depth || "10", 10);

        if (options.watch) {
          console.log(`Watching ${symbol} orderbook... (Ctrl+C to stop)\n`);

          const unsubscribe = readDex.marketDepth.subscribeByName(symbol, 1, (data) => {
            // Clear screen and redraw
            console.clear();
            console.log(`${symbol} Order Book - ${new Date().toLocaleTimeString()}\n`);
            renderOrderbook(data.asks.slice(0, depth), data.bids.slice(0, depth));
          });

          process.on("SIGINT", () => {
            unsubscribe();
            console.log("\n");
            process.exit(0);
          });

          // eslint-disable-next-line @typescript-eslint/no-empty-function
          await new Promise(() => {});
        } else {
          // TODO: either reintroduce the /depth endpoint or fully delete this branch
          // const orderbook = await readDex.marketDepth.getByName({
          //   marketName: symbol,
          //   limit: depth,
          // });
          //
          // if (options.json) {
          //   console.log(JSON.stringify(orderbook, null, 2));
          // } else {
          //   console.log(`${symbol} Order Book\n`);
          //   renderOrderbook(orderbook.asks.slice(0, depth), orderbook.bids.slice(0, depth));
          // }
          console.log(
            "The REST /depth endpoint is currently unavailable. Use --watch for real-time depth via WebSocket.",
          );
        }
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  return markets;
}

function renderOrderbook(
  asks: Array<{ price: number; size: number }>,
  bids: Array<{ price: number; size: number }>,
): void {
  const maxAskSize = Math.max(...asks.map((a) => a.size), 0.001);
  const maxBidSize = Math.max(...bids.map((b) => b.size), 0.001);
  const maxSize = Math.max(maxAskSize, maxBidSize);

  // Header
  console.log("  Price          Size         Depth");
  console.log("  ─────────────────────────────────────────────────────");

  // Asks (reversed so lowest ask is at bottom)
  const sortedAsks = [...asks].sort((a, b) => b.price - a.price);
  for (const ask of sortedAsks) {
    const depthBar = createDepthBar(ask.size, maxSize, 20, false);
    console.log(
      `  \x1b[31m${formatNumber(ask.price, 2).padStart(12)}\x1b[0m  ${formatNumber(ask.size, 4).padStart(10)}  ${depthBar}`,
    );
  }

  // Spread indicator
  if (bids.length > 0 && asks.length > 0) {
    const bestBid = Math.max(...bids.map((b) => b.price));
    const bestAsk = Math.min(...asks.map((a) => a.price));
    const spread = bestAsk - bestBid;
    const spreadPct = (spread / bestAsk) * 100;
    console.log(`  ─── Spread: ${formatPrice(spread)} (${spreadPct.toFixed(3)}%) ───`);
  }

  // Bids
  const sortedBids = [...bids].sort((a, b) => b.price - a.price);
  for (const bid of sortedBids) {
    const depthBar = createDepthBar(bid.size, maxSize, 20, true);
    console.log(
      `  \x1b[32m${formatNumber(bid.price, 2).padStart(12)}\x1b[0m  ${formatNumber(bid.size, 4).padStart(10)}  ${depthBar}`,
    );
  }
}
