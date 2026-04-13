/**
 * MCP Server for Decibel CLI
 *
 * This server implements the Model Context Protocol, allowing AI agents
 * (like Claude) to interact with Decibel DEX programmatically.
 *
 * The server exposes tools for:
 * - Trading (place orders, cancel, set leverage, close positions)
 * - Market data (prices, orderbook, market list)
 * - Account management (balances, trade history)
 *
 * Usage:
 *   npx tsx dist/mcp-server.js
 *
 * Configure in Claude's config (~/.claude.json for Claude Code):
 *   {
 *     "mcpServers": {
 *       "decibel": {
 *         "type": "stdio",
 *         "command": "npx",
 *         "args": ["tsx", "/path/to/decibel-cli/dist/mcp-server.js"],
 *         "cwd": "/path/to/decibel-cli",
 *         "env": {
 *           "DECIBEL_NETWORK": "testnet"
 *         }
 *       }
 *     }
 *   }
 *
 * Note: We use tsx because @decibeltrade/sdk has an ESM issue (missing .js
 * extensions in compiled output). This will be fixed when the SDK updates
 * to moduleResolution: "NodeNext".
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

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
  getBalances,
  getFundingHistory,
  GetFundingHistorySchema,
  getMarkets,
  getOrderbook,
  GetOrderbookSchema,
  getOrderHistory,
  GetOrderHistorySchema,
  getOrders,
  getPositions,
  getPrice,
  GetPriceSchema,
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
} from "../actions/index.js";
import { DexOptions } from "../services/dex-factory.js";

// Define available tools
const TOOLS: Tool[] = [
  // Trading tools
  {
    name: "place_limit_order",
    description:
      "Place a limit order on Decibel DEX. Returns order ID and transaction hash on success.",
    inputSchema: {
      type: "object",
      properties: {
        side: {
          type: "string",
          enum: ["buy", "sell", "long", "short"],
          description: "Order side (buy/long or sell/short)",
        },
        size: {
          type: "number",
          description: "Order size (quantity)",
        },
        symbol: {
          type: "string",
          description: "Market symbol (e.g., BTC/USD, ETH/USD)",
        },
        price: {
          type: "number",
          description: "Limit price",
        },
        timeInForce: {
          type: "string",
          enum: ["gtc", "post-only", "ioc"],
          description: "Time in force (default: gtc)",
        },
        reduceOnly: {
          type: "boolean",
          description: "Reduce-only order (default: false)",
        },
        clientOrderId: {
          type: "string",
          description: "Optional client order ID for tracking",
        },
      },
      required: ["side", "size", "symbol", "price"],
    },
  },
  {
    name: "place_market_order",
    description:
      "Place a market order on Decibel DEX. Executes immediately at current price with slippage tolerance.",
    inputSchema: {
      type: "object",
      properties: {
        side: {
          type: "string",
          enum: ["buy", "sell", "long", "short"],
          description: "Order side",
        },
        size: {
          type: "number",
          description: "Order size",
        },
        symbol: {
          type: "string",
          description: "Market symbol",
        },
        slippage: {
          type: "number",
          description: "Slippage percentage (default: 1%)",
        },
        reduceOnly: {
          type: "boolean",
          description: "Reduce-only order",
        },
        clientOrderId: {
          type: "string",
          description: "Optional client order ID for tracking",
        },
      },
      required: ["side", "size", "symbol"],
    },
  },
  {
    name: "place_stop_limit_order",
    description:
      "Place a stop limit order. The order triggers when the market reaches the stop price, then posts as a limit order at the specified price.",
    inputSchema: {
      type: "object",
      properties: {
        side: {
          type: "string",
          enum: ["buy", "sell", "long", "short"],
          description: "Order side",
        },
        size: {
          type: "number",
          description: "Order size",
        },
        symbol: {
          type: "string",
          description: "Market symbol (e.g., BTC/USD)",
        },
        price: {
          type: "number",
          description: "Limit price (execution price after trigger)",
        },
        stopPrice: {
          type: "number",
          description: "Stop trigger price",
        },
        timeInForce: {
          type: "string",
          enum: ["gtc", "post-only", "ioc"],
          description: "Time in force (default: gtc)",
        },
        reduceOnly: {
          type: "boolean",
          description: "Reduce-only order (default: false)",
        },
        clientOrderId: {
          type: "string",
          description: "Optional client order ID for tracking",
        },
      },
      required: ["side", "size", "symbol", "price", "stopPrice"],
    },
  },
  {
    name: "place_stop_market_order",
    description:
      "Place a stop market order. The order triggers when the market reaches the stop price, then executes immediately with slippage tolerance.",
    inputSchema: {
      type: "object",
      properties: {
        side: {
          type: "string",
          enum: ["buy", "sell", "long", "short"],
          description: "Order side",
        },
        size: {
          type: "number",
          description: "Order size",
        },
        symbol: {
          type: "string",
          description: "Market symbol (e.g., BTC/USD)",
        },
        stopPrice: {
          type: "number",
          description: "Stop trigger price",
        },
        slippage: {
          type: "number",
          description: "Slippage percentage from stop price (default: 1%)",
        },
        reduceOnly: {
          type: "boolean",
          description: "Reduce-only order (default: false)",
        },
        clientOrderId: {
          type: "string",
          description: "Optional client order ID for tracking",
        },
      },
      required: ["side", "size", "symbol", "stopPrice"],
    },
  },
  {
    name: "place_twap_order",
    description:
      "Place a TWAP (Time-Weighted Average Price) order. Splits execution across a duration at regular intervals.",
    inputSchema: {
      type: "object",
      properties: {
        side: {
          type: "string",
          enum: ["buy", "sell", "long", "short"],
          description: "Order side",
        },
        size: {
          type: "number",
          description: "Total order size",
        },
        symbol: {
          type: "string",
          description: "Market symbol (e.g., BTC/USD)",
        },
        duration: {
          type: "number",
          description: "Total duration in seconds (min 120 = 2 min, max 86400 = 24 hrs)",
        },
        frequency: {
          type: "number",
          description: "Execution frequency in seconds (min 60 = 1 min)",
        },
        reduceOnly: {
          type: "boolean",
          description: "Reduce-only order (default: false)",
        },
        clientOrderId: {
          type: "string",
          description: "Optional client order ID for tracking",
        },
      },
      required: ["side", "size", "symbol", "duration", "frequency"],
    },
  },
  {
    name: "close_position",
    description:
      "Close an open position. Places a reduce-only market order in the opposite direction. Supports partial closes.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "Market symbol (e.g., BTC/USD)",
        },
        slippage: {
          type: "number",
          description: "Slippage percentage (default: 1%)",
        },
        size: {
          type: "number",
          description: "Partial close size. Omit to close full position.",
        },
      },
      required: ["symbol"],
    },
  },
  {
    name: "cancel_order",
    description: "Cancel an open order by order ID.",
    inputSchema: {
      type: "object",
      properties: {
        orderId: {
          type: "string",
          description: "Order ID to cancel",
        },
        symbol: {
          type: "string",
          description: "Market symbol",
        },
      },
      required: ["orderId", "symbol"],
    },
  },
  {
    name: "cancel_all_orders",
    description: "Cancel all open orders. Optionally filter by market symbol.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "Market symbol to filter by (optional, cancels all if omitted)",
        },
      },
    },
  },
  {
    name: "cancel_twap_order",
    description: "Cancel an active TWAP order by order ID.",
    inputSchema: {
      type: "object",
      properties: {
        orderId: {
          type: "string",
          description: "TWAP order ID to cancel",
        },
        symbol: {
          type: "string",
          description: "Market symbol",
        },
      },
      required: ["orderId", "symbol"],
    },
  },
  {
    name: "place_tp_sl",
    description:
      "Set take-profit and/or stop-loss for an existing position. Specify trigger and limit prices. Omit size fields to apply to the full position.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "Market symbol (e.g., BTC/USD)",
        },
        tpTriggerPrice: {
          type: "number",
          description: "Take-profit trigger price",
        },
        tpLimitPrice: {
          type: "number",
          description: "Take-profit limit price (execution price)",
        },
        tpSize: {
          type: "number",
          description: "Take-profit size (omit for full position)",
        },
        slTriggerPrice: {
          type: "number",
          description: "Stop-loss trigger price",
        },
        slLimitPrice: {
          type: "number",
          description: "Stop-loss limit price (execution price)",
        },
        slSize: {
          type: "number",
          description: "Stop-loss size (omit for full position)",
        },
      },
      required: ["symbol"],
    },
  },
  {
    name: "cancel_tp_sl",
    description: "Cancel a TP/SL order for a position by order ID.",
    inputSchema: {
      type: "object",
      properties: {
        orderId: {
          type: "string",
          description: "TP/SL order ID to cancel",
        },
        symbol: {
          type: "string",
          description: "Market symbol",
        },
      },
      required: ["orderId", "symbol"],
    },
  },
  {
    name: "get_tp_sl",
    description:
      "Get all TP/SL orders for a market position, including position-level and fixed-size TP/SL orders.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "Market symbol (e.g., BTC/USD)",
        },
      },
      required: ["symbol"],
    },
  },
  {
    name: "set_leverage",
    description: "Set leverage for a market.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "Market symbol",
        },
        leverage: {
          type: "number",
          description: "Leverage value (1-100)",
        },
        marginType: {
          type: "string",
          enum: ["cross", "isolated"],
          description: "Margin type (default: cross)",
        },
      },
      required: ["symbol", "leverage"],
    },
  },
  {
    name: "set_margin_type",
    description:
      "Switch margin type for a market between cross and isolated. Preserves current leverage.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "Market symbol (e.g., BTC/USD)",
        },
        marginType: {
          type: "string",
          enum: ["cross", "isolated"],
          description: "Margin type to switch to",
        },
      },
      required: ["symbol", "marginType"],
    },
  },
  {
    name: "get_positions",
    description: "Get all open positions for the account.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_orders",
    description: "Get all open orders for the account.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_trade_history",
    description: "Get recent trade history for the account.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Number of trades to return (default: 20, max: 100)",
        },
      },
    },
  },

  {
    name: "get_active_twaps",
    description: "Get all active TWAP orders for the account.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_order_history",
    description:
      "Get order history for the account (all order states including filled, cancelled, etc.).",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Number of orders to return (default: 20, max: 200)",
        },
      },
    },
  },
  {
    name: "get_twap_history",
    description: "Get TWAP order history for the account (completed and cancelled TWAPs).",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Number of TWAP orders to return (default: 20, max: 200)",
        },
      },
    },
  },
  {
    name: "get_funding_history",
    description: "Get funding rate payment history for the account.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Number of records to return (default: 20, max: 200)",
        },
      },
    },
  },

  // Market tools
  {
    name: "get_markets",
    description: "List all available markets on Decibel DEX with their configurations.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_price",
    description: "Get current price, funding rate, and open interest for a market.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "Market symbol (e.g., BTC/USD)",
        },
      },
      required: ["symbol"],
    },
  },
  {
    name: "get_orderbook",
    description: "Get order book (bids and asks) for a market. Fetches a snapshot via WebSocket.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "Market symbol (e.g., BTC/USD)",
        },
        depth: {
          type: "number",
          description: "Number of price levels (default: 10, max: 20)",
        },
      },
      required: ["symbol"],
    },
  },
  // Account tools
  {
    name: "get_balances",
    description:
      "Get account balances including wallet USDC, trading account value, and margin info.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

export function createMcpServer(dexOptions: DexOptions = {}) {
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  const server = new Server(
    {
      name: "decibel-cli",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // Handle list tools request
  server.setRequestHandler(ListToolsRequestSchema, () => {
    return { tools: TOOLS };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result: unknown;

      switch (name) {
        // Trading tools
        case "place_limit_order":
          result = await placeLimitOrder(PlaceLimitOrderSchema.parse(args), dexOptions);
          break;
        case "place_market_order":
          result = await placeMarketOrder(PlaceMarketOrderSchema.parse(args), dexOptions);
          break;
        case "place_stop_limit_order":
          result = await placeStopLimitOrder(PlaceStopLimitOrderSchema.parse(args), dexOptions);
          break;
        case "place_stop_market_order":
          result = await placeStopMarketOrder(PlaceStopMarketOrderSchema.parse(args), dexOptions);
          break;
        case "place_twap_order":
          result = await placeTwapOrder(PlaceTwapOrderSchema.parse(args), dexOptions);
          break;
        case "close_position":
          result = await closePosition(ClosePositionSchema.parse(args), dexOptions);
          break;
        case "cancel_order":
          result = await cancelOrder(CancelOrderSchema.parse(args), dexOptions);
          break;
        case "cancel_all_orders":
          result = await cancelAllOrders(CancelAllOrdersSchema.parse(args ?? {}), dexOptions);
          break;
        case "cancel_twap_order":
          result = await cancelTwapOrder(CancelTwapOrderSchema.parse(args), dexOptions);
          break;
        case "place_tp_sl":
          result = await placeTpSl(PlaceTpSlSchema.parse(args), dexOptions);
          break;
        case "cancel_tp_sl":
          result = await cancelTpSl(CancelTpSlSchema.parse(args), dexOptions);
          break;
        case "get_tp_sl":
          result = await getTpSl(GetTpSlSchema.parse(args), dexOptions);
          break;
        case "set_leverage":
          result = await setLeverage(SetLeverageSchema.parse(args), dexOptions);
          break;
        case "set_margin_type":
          result = await setMarginType(SetMarginTypeSchema.parse(args), dexOptions);
          break;
        case "get_positions":
          result = await getPositions(dexOptions);
          break;
        case "get_orders":
          result = await getOrders(dexOptions);
          break;
        case "get_trade_history":
          result = await getTradeHistory(GetTradeHistorySchema.parse(args ?? {}), dexOptions);
          break;
        case "get_active_twaps":
          result = await getActiveTwaps(dexOptions);
          break;
        case "get_order_history":
          result = await getOrderHistory(GetOrderHistorySchema.parse(args ?? {}), dexOptions);
          break;
        case "get_twap_history":
          result = await getTwapHistory(GetTwapHistorySchema.parse(args ?? {}), dexOptions);
          break;
        case "get_funding_history":
          result = await getFundingHistory(GetFundingHistorySchema.parse(args ?? {}), dexOptions);
          break;

        // Market tools
        case "get_markets":
          result = await getMarkets(dexOptions);
          break;
        case "get_price":
          result = await getPrice(GetPriceSchema.parse(args), dexOptions);
          break;
        case "get_orderbook":
          result = await getOrderbook(GetOrderbookSchema.parse(args), dexOptions);
          break;

        // Account tools
        case "get_balances":
          result = await getBalances(dexOptions);
          break;

        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: message }),
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

export async function runMcpServer(dexOptions: DexOptions = {}) {
  const server = createMcpServer(dexOptions);
  const transport = new StdioServerTransport();

  await server.connect(transport);

  // Handle shutdown
  process.on("SIGINT", async () => {
    await server.close();
    process.exit(0);
  });
}
