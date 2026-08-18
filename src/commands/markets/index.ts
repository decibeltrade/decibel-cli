import { Command } from "commander";

import {
  getMarkets,
  getOrderbook,
  GetOrderbookSchema,
  getPrice,
  GetPriceSchema,
} from "../../actions/index.js";
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
    .option("--network <network>", "Network to use (mainnet, testnet, local)")
    .action(async (options: MarketCommandOptions) => {
      try {
        const result = await getMarkets({ network: options.network });

        formatOutput(
          result.markets,
          (marketsList) => {
            const table = createTable(["Market", "Max Leverage", "Tick Size", "Min Size", "Mode"]);
            for (const m of marketsList) {
              table.push([
                m.name,
                `${m.maxLeverage}x`,
                formatNumber(m.tickSize, m.priceDecimals),
                formatNumber(m.minSize, m.sizeDecimals),
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
    .option("--network <network>", "Network to use (mainnet, testnet, local)")
    .option("-w, --watch", "Watch price in real-time")
    .action(async (symbol: string, options: MarketCommandOptions) => {
      try {
        if (options.watch) {
          console.log(`Watching ${symbol} price... (Ctrl+C to stop)\n`);

          const readDex = createReadDex({ network: options.network });
          const unsubscribe = readDex.marketPrices.subscribeByName(symbol, (data) => {
            const fundingPct = data.price.funding_rate_bps / 100;
            const line = `${symbol}: ${formatPrice(data.price.mark_px)} | Oracle: ${formatPrice(data.price.oracle_px)} | Funding: ${fundingPct.toFixed(4)}%`;
            process.stdout.write(`\r${line.padEnd(80)}`);
          });

          process.on("SIGINT", () => {
            unsubscribe();
            console.log("\n");
            process.exit(0);
          });

          // eslint-disable-next-line @typescript-eslint/no-empty-function
          await new Promise(() => {});
        } else {
          const params = GetPriceSchema.parse({ symbol });
          const data = await getPrice(params, { network: options.network });

          formatOutput(
            data,
            (d) => {
              const table = createTable(["Property", "Value"]);
              table.push(["Symbol", d.symbol]);
              table.push(["Mark Price", formatPrice(d.markPrice)]);
              table.push(["Oracle Price", formatPrice(d.oraclePrice)]);
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
    .option("--network <network>", "Network to use (mainnet, testnet, local)")
    .option("-w, --watch", "Watch orderbook in real-time")
    .option("--depth <depth>", "Number of levels to show", "10")
    .action(async (symbol: string, options: MarketCommandOptions & { depth?: string }) => {
      try {
        const readDex = createReadDex({ network: options.network });
        const depth = parseInt(options.depth || "10", 10);

        if (options.watch) {
          console.log(`Watching ${symbol} orderbook... (Ctrl+C to stop)\n`);

          const unsubscribe = readDex.marketDepth.subscribeByName(symbol, 1, (data) => {
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
          const params = GetOrderbookSchema.parse({ symbol, depth });
          const data = await getOrderbook(params, { network: options.network });

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

  console.log("  Price          Size         Depth");
  console.log("  ─────────────────────────────────────────────────────");

  const sortedAsks = [...asks].sort((a, b) => b.price - a.price);
  for (const ask of sortedAsks) {
    const depthBar = createDepthBar(ask.size, maxSize, 20, false);
    console.log(
      `  \x1b[31m${formatNumber(ask.price, 2).padStart(12)}\x1b[0m  ${formatNumber(ask.size, 4).padStart(10)}  ${depthBar}`,
    );
  }

  if (bids.length > 0 && asks.length > 0) {
    const bestBid = Math.max(...bids.map((b) => b.price));
    const bestAsk = Math.min(...asks.map((a) => a.price));
    const spread = bestAsk - bestBid;
    const spreadPct = (spread / bestAsk) * 100;
    console.log(`  ─── Spread: ${formatPrice(spread)} (${spreadPct.toFixed(3)}%) ───`);
  }

  const sortedBids = [...bids].sort((a, b) => b.price - a.price);
  for (const bid of sortedBids) {
    const depthBar = createDepthBar(bid.size, maxSize, 20, true);
    console.log(
      `  \x1b[32m${formatNumber(bid.price, 2).padStart(12)}\x1b[0m  ${formatNumber(bid.size, 4).padStart(10)}  ${depthBar}`,
    );
  }
}
