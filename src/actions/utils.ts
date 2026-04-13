import { DecibelReadDex, TimeInForce } from "@decibeltrade/sdk";

/**
 * Round price to the nearest tick size
 */
export function roundToTick(price: number, tickSize: number, pxDecimals: number): number {
  const tickInPrice = tickSize / Math.pow(10, pxDecimals);
  const rounded = Math.round(price / tickInPrice) * tickInPrice;
  const precision = Math.max(0, pxDecimals - Math.floor(Math.log10(tickSize)));
  return Number(rounded.toFixed(precision));
}

/**
 * Parse side string to boolean (true = buy/long, false = sell/short)
 */
export function parseSide(side: string): boolean {
  const lower = side.toLowerCase();
  if (["buy", "long"].includes(lower)) return true;
  if (["sell", "short"].includes(lower)) return false;
  throw new Error(`Invalid side: "${side}". Must be one of: buy, long, sell, short`);
}

/**
 * Parse time-in-force string to SDK enum
 */
export function parseTimeInForce(tif: string): TimeInForce {
  switch (tif.toLowerCase()) {
    case "gtc":
      return TimeInForce.GoodTillCanceled;
    case "post-only":
      return TimeInForce.PostOnly;
    case "ioc":
      return TimeInForce.ImmediateOrCancel;
    default:
      throw new Error(`Invalid time in force: "${tif}". Use gtc, post-only, or ioc`);
  }
}

export function toChainPrice(price: number, pxDecimals: number): number {
  return Math.round(price * Math.pow(10, pxDecimals));
}

export function toChainSize(size: number, szDecimals: number): number {
  return Math.round(size * Math.pow(10, szDecimals));
}

/**
 * Find a market by symbol name (case-insensitive). Throws if not found.
 */
export async function findMarket(readDex: DecibelReadDex, symbol: string) {
  const markets = await readDex.markets.getAll();
  const market = markets.find((m) => m.market_name.toLowerCase() === symbol.toLowerCase());
  if (!market) {
    throw new Error(`Market "${symbol}" not found`);
  }
  return market;
}
