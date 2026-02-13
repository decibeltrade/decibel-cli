/**
 * MCP Trading Tools
 *
 * These tools allow AI agents to trade on Decibel DEX via the Model Context Protocol.
 * Each tool maps to a trading operation and returns structured JSON responses.
 */

import { z } from "zod";
import { TimeInForce } from "@decibeltrade/sdk";

import {
  createReadDex,
  createWriteDex,
  getConfig,
  resolveSubaccountAddress,
  DexOptions,
} from "../../services/dex-factory.js";

// Tool schemas for MCP
export const PlaceLimitOrderSchema = z.object({
  side: z.enum(["buy", "sell", "long", "short"]).describe("Order side"),
  size: z.number().positive().describe("Order size"),
  symbol: z.string().describe("Market symbol (e.g., BTC-PERP)"),
  price: z.number().positive().describe("Limit price"),
  timeInForce: z
    .enum(["gtc", "post-only", "ioc"])
    .optional()
    .default("gtc")
    .describe("Time in force"),
  reduceOnly: z.boolean().optional().default(false).describe("Reduce-only order"),
  clientOrderId: z.string().optional().describe("Client order ID for tracking"),
});

export const PlaceMarketOrderSchema = z.object({
  side: z.enum(["buy", "sell", "long", "short"]).describe("Order side"),
  size: z.number().positive().describe("Order size"),
  symbol: z.string().describe("Market symbol (e.g., BTC-PERP)"),
  slippage: z.number().min(0).max(100).optional().default(1).describe("Slippage percentage"),
  reduceOnly: z.boolean().optional().default(false).describe("Reduce-only order"),
});

export const CancelOrderSchema = z.object({
  orderId: z.string().describe("Order ID to cancel"),
  symbol: z.string().describe("Market symbol"),
});

export const SetLeverageSchema = z.object({
  symbol: z.string().describe("Market symbol"),
  leverage: z.number().int().min(1).max(100).describe("Leverage value"),
  marginType: z.enum(["cross", "isolated"]).optional().default("cross").describe("Margin type"),
});

/**
 * Round price to the nearest tick size
 */
function roundToTick(price: number, tickSize: number, pxDecimals: number): number {
  // Convert tick size from raw to human-readable
  const tickInPrice = tickSize / Math.pow(10, pxDecimals);
  // Round to nearest tick
  const rounded = Math.round(price / tickInPrice) * tickInPrice;
  // Fix floating point precision issues
  const precision = Math.max(0, pxDecimals - Math.floor(Math.log10(tickSize)));
  return Number(rounded.toFixed(precision));
}

// Tool implementations
export async function placeLimitOrder(
  params: z.infer<typeof PlaceLimitOrderSchema>,
  dexOptions: DexOptions = {}
) {
  const isBuy = ["buy", "long"].includes(params.side);

  let timeInForce: TimeInForce = TimeInForce.GoodTillCanceled;
  switch (params.timeInForce) {
    case "post-only":
      timeInForce = TimeInForce.PostOnly;
      break;
    case "ioc":
      timeInForce = TimeInForce.ImmediateOrCancel;
      break;
  }

  const writeDex = await createWriteDex(dexOptions);
  const readDex = createReadDex(dexOptions);

  // Get market info for price rounding
  const markets = await readDex.markets.getAll();
  const market = markets.find(
    (m) => m.market_name.toLowerCase() === params.symbol.toLowerCase()
  );

  if (!market) {
    return { success: false, error: `Market ${params.symbol} not found` };
  }

  // Round price to tick size
  const roundedPrice = roundToTick(params.price, market.tick_size, market.px_decimals);

  // Convert human-readable values to chain units (integers)
  const chainPrice = Math.round(roundedPrice * Math.pow(10, market.px_decimals));
  const chainSize = Math.round(params.size * Math.pow(10, market.sz_decimals));

  const result = await writeDex.placeOrder({
    marketName: params.symbol,
    price: chainPrice,
    size: chainSize,
    isBuy,
    timeInForce,
    isReduceOnly: params.reduceOnly,
    clientOrderId: params.clientOrderId,
    tickSize: market.tick_size,
  });

  return result;
}

export async function placeMarketOrder(
  params: z.infer<typeof PlaceMarketOrderSchema>,
  dexOptions: DexOptions = {}
) {
  const isBuy = ["buy", "long"].includes(params.side);
  const slippage = params.slippage / 100;

  const writeDex = await createWriteDex(dexOptions);
  const readDex = createReadDex(dexOptions);

  // Get market info first
  const markets = await readDex.markets.getAll();
  const market = markets.find(
    (m) => m.market_name.toLowerCase() === params.symbol.toLowerCase()
  );

  if (!market) {
    return { success: false, error: `Market ${params.symbol} not found` };
  }

  // Get current price
  const prices = await readDex.marketPrices.getByName({ marketName: params.symbol });
  const currentPrice = prices[0]?.mark_px;

  if (!currentPrice) {
    return { success: false, error: `Could not get price for ${params.symbol}` };
  }

  // Calculate limit price with slippage
  const limitPrice = isBuy
    ? currentPrice * (1 + slippage)
    : currentPrice * (1 - slippage);

  // Round to tick size
  const roundedPrice = roundToTick(limitPrice, market.tick_size, market.px_decimals);

  // Convert human-readable values to chain units (integers)
  const chainPrice = Math.round(roundedPrice * Math.pow(10, market.px_decimals));
  const chainSize = Math.round(params.size * Math.pow(10, market.sz_decimals));

  const result = await writeDex.placeOrder({
    marketName: params.symbol,
    price: chainPrice,
    size: chainSize,
    isBuy,
    timeInForce: TimeInForce.ImmediateOrCancel,
    isReduceOnly: params.reduceOnly,
    tickSize: market.tick_size,
    subaccountAddr: resolveSubaccountAddress(dexOptions),
  });

  return result;
}

export async function cancelOrder(
  params: z.infer<typeof CancelOrderSchema>,
  dexOptions: DexOptions = {}
) {
  const writeDex = await createWriteDex(dexOptions);

  const result = await writeDex.cancelOrder({
    orderId: params.orderId,
    marketName: params.symbol,
    subaccountAddr: resolveSubaccountAddress(dexOptions),
  });

  return {
    success: true,
    transactionHash: result.hash,
  };
}

export async function setLeverage(
  params: z.infer<typeof SetLeverageSchema>,
  dexOptions: DexOptions = {}
) {
  const writeDex = await createWriteDex(dexOptions);
  const readDex = createReadDex(dexOptions);

  const markets = await readDex.markets.getAll();
  const market = markets.find(
    (m) => m.market_name.toLowerCase() === params.symbol.toLowerCase()
  );

  if (!market) {
    return { success: false, error: `Market ${params.symbol} not found` };
  }

  if (params.leverage > market.max_leverage) {
    return {
      success: false,
      error: `Leverage ${params.leverage}x exceeds max ${market.max_leverage}x for ${params.symbol}`,
    };
  }

  const result = await writeDex.configureUserSettingsForMarket({
    marketAddr: market.market_addr,
    subaccountAddr: resolveSubaccountAddress(dexOptions),
    isCross: params.marginType === "cross",
    userLeverage: params.leverage,
  });

  return {
    success: true,
    symbol: params.symbol,
    leverage: params.leverage,
    marginType: params.marginType,
    transactionHash: result.hash,
  };
}

export async function getPositions(dexOptions: DexOptions = {}) {
  const subaccountAddr = resolveSubaccountAddress(dexOptions);
  const readDex = createReadDex(dexOptions);

  const positions = await readDex.userPositions.getByAddr({
    subAddr: subaccountAddr,
    limit: 100,
  });

  return { positions };
}

export async function getOpenOrders(dexOptions: DexOptions = {}) {
  const subaccountAddr = resolveSubaccountAddress(dexOptions);
  const readDex = createReadDex(dexOptions);
  
  const orders = await readDex.userOpenOrders.getByAddr({ subAddr: subaccountAddr });

  return { orders };
}
