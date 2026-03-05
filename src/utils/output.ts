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
 * Format price with $ prefix
 */
export function formatPrice(value: number, decimals = 2): string {
  return `$${formatNumber(value, decimals)}`;
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
