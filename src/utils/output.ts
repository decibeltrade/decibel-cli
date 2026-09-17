import chalk from "chalk";
import Table from "cli-table3";

export interface OutputOptions {
  json?: boolean;
}

/**
 * Format output for both human-readable and JSON formats
 */
export function formatOutput<T>(
  data: T,
  tableFormatter: (data: T) => void,
  options: OutputOptions,
): void {
  if (options.json) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    tableFormatter(data);
  }
}

/**
 * Create a styled table with consistent formatting
 */
export function createTable(headers: string[], options: { compact?: boolean } = {}): Table.Table {
  return new Table({
    head: headers.map((h) => chalk.cyan(h)),
    style: {
      head: [],
      border: [],
      compact: options.compact,
    },
    chars: options.compact
      ? {
          top: "",
          "top-mid": "",
          "top-left": "",
          "top-right": "",
          bottom: "",
          "bottom-mid": "",
          "bottom-left": "",
          "bottom-right": "",
          left: "",
          "left-mid": "",
          mid: "",
          "mid-mid": "",
          right: "",
          "right-mid": "",
          middle: " ",
        }
      : undefined,
  });
}

/**
 * Format a number with appropriate decimal places
 */
export function formatNumber(
  value: number,
  decimals = 2,
  options: { showSign?: boolean } = {},
): string {
  const formatted = value.toFixed(decimals);
  if (options.showSign && value > 0) {
    return `+${formatted}`;
  }
  return formatted;
}

/**
 * Format an amount at its asset's full precision without the trailing-zero
 * noise `toFixed` leaves behind — a 0.001 minimum on an 8-decimal market would
 * otherwise print as `0.00100000`, and a 10-unit one as `10.00000000`.
 *
 * Use this for market constraints (tick/min/lot size), where the significant
 * digits vary by orders of magnitude between markets and a fixed precision
 * either truncates or buries the value in zeros.
 */
export function formatAmount(value: number, decimals: number): string {
  const fixed = value.toFixed(decimals);
  return fixed.includes(".") ? fixed.replace(/0+$/, "").replace(/\.$/, "") : fixed;
}

/** Format a USD account value. Defaults to 2 decimals. */
export function formatUsd(value: number, decimals = 2): string {
  return `$${formatNumber(value, decimals)}`;
}

const PRICE_SIGNIFICANT_DIGITS = 5;

/** Cap used when the caller has no market precision to hand, matching the web app. */
const DEFAULT_PX_DECIMALS = 8;

function integerDigitCount(value: number): number {
  return Math.floor(value).toString().length;
}

function leadingZerosAfterDecimal(value: number): number {
  if (!Number.isFinite(value) || value === 0) return 0;
  // Read the exponent rather than the decimal string: toExponential is exact
  // about magnitude where toFixed would already have rounded the digits away.
  // The capture group is mandatory, so it is always present on a match.
  const match = /e([+-]\d+)$/i.exec(Math.abs(value).toExponential());
  const exponent = match ? parseInt(match[1], 10) : 0;
  return exponent < 0 ? -exponent - 1 : 0;
}

export interface PriceOptions {
  /** Market price decimals. Caps precision; defaults to the web app's fallback. */
  pxDecimals?: number;
  /** Prefix with `$`. */
  symbol?: boolean;
}

/**
 * Format a market price, scaling precision to its magnitude.
 *
 * Ported from the web app's `NumberFormatter.price`: show five significant
 * digits, capped by the market's price decimals. A fixed decimal count cannot
 * serve both ends of the range — two decimals renders every sub-cent asset as
 * `$0.00`, and eight buries `$12,345` in noise.
 *
 * A value too small to show at the available precision floors to the smallest
 * representable price rather than to zero, so a non-zero price never reads as
 * no price at all.
 *
 * The thousands separator the web app applies is deliberately omitted: it is
 * locale-dependent, and in locales that group with `.` it would make CLI output
 * ambiguous. Nothing else in the CLI separates thousands either.
 */
export function formatPrice(value: number, options: PriceOptions = {}): string {
  const { pxDecimals = DEFAULT_PX_DECIMALS, symbol = true } = options;
  if (!Number.isFinite(value)) return String(value);

  const withSymbol = (text: string) => (symbol ? `$${text}` : text);
  const absolute = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (absolute === 0) {
    return withSymbol(pxDecimals === 0 ? "0" : `0.${"0".repeat(Math.min(pxDecimals, 4))}`);
  }

  const decimals = Math.max(
    0,
    Math.min(
      pxDecimals,
      PRICE_SIGNIFICANT_DIGITS - integerDigitCount(absolute) + leadingZerosAfterDecimal(absolute),
    ),
  );

  const rounded = Math.round(absolute * 10 ** decimals) / 10 ** decimals;
  if (rounded === 0) {
    // Too small to render at this precision: show the smallest price that can
    // be, so the caller sees "tiny" rather than "zero".
    return `${sign}${withSymbol(decimals === 0 ? "0" : `0.${"0".repeat(decimals - 1)}1`)}`;
  }

  return `${sign}${withSymbol(rounded.toFixed(decimals))}`;
}

/**
 * Format PnL with color coding
 */
export function formatPnL(value: number, decimals = 2): string {
  const formatted = formatNumber(value, decimals, { showSign: true });
  if (value > 0) {
    return chalk.green(formatted);
  } else if (value < 0) {
    return chalk.red(formatted);
  }
  return formatted;
}

/**
 * Format percentage
 */
export function formatPercent(value: number, decimals = 2): string {
  return `${formatNumber(value * 100, decimals)}%`;
}

/**
 * Format side (buy/sell, long/short) with color
 */
export function formatSide(side: string): string {
  const normalized = side.toLowerCase();
  if (normalized === "buy" || normalized === "long") {
    return chalk.green(side.toUpperCase());
  }
  return chalk.red(side.toUpperCase());
}

/**
 * Format address (truncated)
 */
export function formatAddress(address: string, chars = 6): string {
  if (address.length <= chars * 2 + 3) {
    return address;
  }
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/**
 * Most account endpoints identify a market only by address, which is unreadable
 * in a table. An unlisted market still shows its address rather than nothing.
 */
export function marketLabel(marketAddr: string, names?: Map<string, string>): string {
  return names?.get(marketAddr.toLowerCase()) ?? formatAddress(marketAddr, 6);
}

/**
 * Print success message
 */
export function printSuccess(message: string): void {
  console.log(chalk.green(`✓ ${message}`));
}

/**
 * Print error message
 */
export function printError(message: string): void {
  console.error(chalk.red(`✗ ${message}`));
}

/**
 * Print warning message
 */
export function printWarning(message: string): void {
  console.log(chalk.yellow(`⚠ ${message}`));
}

/**
 * Print info message
 */
export function printInfo(message: string): void {
  console.log(chalk.blue(`ℹ ${message}`));
}

/**
 * Format timestamp
 */
export function formatTimestamp(timestamp: number | string | Date): string {
  const date = new Date(timestamp);
  return date.toLocaleString();
}

/**
 * Create depth visualization bar for orderbook
 */
export function createDepthBar(size: number, maxSize: number, width = 20, isBid = true): string {
  const filledWidth = Math.round((size / maxSize) * width);
  const emptyWidth = width - filledWidth;

  const filledChar = isBid ? chalk.green("█") : chalk.red("█");
  const emptyChar = chalk.gray("░");

  return isBid
    ? emptyChar.repeat(emptyWidth) + filledChar.repeat(filledWidth)
    : filledChar.repeat(filledWidth) + emptyChar.repeat(emptyWidth);
}

/**
 * Render an orderbook: asks descending, the spread, then bids descending, each
 * row with a depth bar scaled against the largest level on either side.
 *
 * Prices scale their own precision, so perp and spot books render from the same
 * code without a per-product decimal setting.
 */
export function renderOrderbook(
  asks: Array<{ price: number; size: number }>,
  bids: Array<{ price: number; size: number }>,
  { pxDecimals }: PriceOptions = {},
): void {
  const maxSize = Math.max(...asks.map((a) => a.size), ...bids.map((b) => b.size), 0.001);

  console.log("  Price          Size         Depth");
  console.log("  ─────────────────────────────────────────────────────");

  const sortedAsks = [...asks].sort((a, b) => b.price - a.price);
  for (const ask of sortedAsks) {
    const depthBar = createDepthBar(ask.size, maxSize, 20, false);
    console.log(
      `  ${chalk.red(formatPrice(ask.price, { pxDecimals, symbol: false }).padStart(12))}  ${formatNumber(ask.size, 4).padStart(10)}  ${depthBar}`,
    );
  }

  if (bids.length > 0 && asks.length > 0) {
    const bestBid = Math.max(...bids.map((b) => b.price));
    const bestAsk = Math.min(...asks.map((a) => a.price));
    const spread = bestAsk - bestBid;
    const spreadPct = (spread / bestAsk) * 100;
    console.log(
      `  ─── Spread: ${formatPrice(spread, { pxDecimals })} (${spreadPct.toFixed(3)}%) ───`,
    );
  }

  const sortedBids = [...bids].sort((a, b) => b.price - a.price);
  for (const bid of sortedBids) {
    const depthBar = createDepthBar(bid.size, maxSize, 20, true);
    console.log(
      `  ${chalk.green(formatPrice(bid.price, { pxDecimals, symbol: false }).padStart(12))}  ${formatNumber(bid.size, 4).padStart(10)}  ${depthBar}`,
    );
  }
}
