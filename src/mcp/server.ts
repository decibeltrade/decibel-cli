/**
 * MCP Server for Decibel CLI
 *
 * This server implements the Model Context Protocol, allowing AI agents
 * (like Claude) to interact with Decibel DEX programmatically.
 *
 * The server exposes tools for:
 * - Trading (place orders, cancel, set leverage)
 * - Market data (prices, orderbook, market list)
 * - Account management (balances, deposit, withdraw)
 *
 * Usage:
 *   node dist/mcp-server.js
 *
 * Or configure in Claude Desktop's config.json:
 *   {
 *     "mcpServers": {
 *       "decibel": {
 *         "command": "decibel-cli",
 *         "args": ["mcp-server"]
 *       }
 *     }
 *   }
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

import { DexOptions } from "../services/dex-factory.js";

// Import tool implementations
import {
  placeLimitOrder,
  PlaceLimitOrderSchema,
  placeMarketOrder,
  PlaceMarketOrderSchema,
  cancelOrder,
  CancelOrderSchema,
  setLeverage,
  SetLeverageSchema,
  getPositions,
  getOpenOrders,
} from "./tools/trading-tools.js";

import {
  getMarkets,
  getPrice,
  GetPriceSchema,
  getOrderbook,
  GetOrderbookSchema,
} from "./tools/market-tools.js";

import {
  getBalances,
  deposit,
  DepositSchema,
  withdraw,
  WithdrawSchema,
} from "./tools/account-tools.js";

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
          description: "Market symbol (e.g., BTC-PERP, ETH-PERP)",
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
      },
      required: ["side", "size", "symbol"],
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

  // Market tools
  {
    name: "get_markets",
    description:
      "List all available markets on Decibel DEX with their configurations.",
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
          description: "Market symbol (e.g., BTC-PERP)",
        },
      },
      required: ["symbol"],
    },
  },
  {
    name: "get_orderbook",
    description: "Get order book (bids and asks) for a market.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "Market symbol",
        },
        depth: {
          type: "number",
          description: "Number of levels (default: 10, max: 50)",
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
  {
    name: "deposit",
    description: "Deposit USDC from wallet to trading account.",
    inputSchema: {
      type: "object",
      properties: {
        amount: {
          type: "number",
          description: "Amount of USDC to deposit",
        },
      },
      required: ["amount"],
    },
  },
  {
    name: "withdraw",
    description: "Withdraw USDC from trading account to wallet.",
    inputSchema: {
      type: "object",
      properties: {
        amount: {
          type: "number",
          description: "Amount of USDC to withdraw",
        },
      },
      required: ["amount"],
    },
  },
];

export async function createMcpServer(dexOptions: DexOptions = {}) {
  const server = new Server(
    {
      name: "decibel-cli",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Handle list tools request
  server.setRequestHandler(ListToolsRequestSchema, async () => {
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
          result = await placeLimitOrder(
            PlaceLimitOrderSchema.parse(args),
            dexOptions
          );
          break;
        case "place_market_order":
          result = await placeMarketOrder(
            PlaceMarketOrderSchema.parse(args),
            dexOptions
          );
          break;
        case "cancel_order":
          result = await cancelOrder(CancelOrderSchema.parse(args), dexOptions);
          break;
        case "set_leverage":
          result = await setLeverage(SetLeverageSchema.parse(args), dexOptions);
          break;
        case "get_positions":
          result = await getPositions(dexOptions);
          break;
        case "get_orders":
          result = await getOpenOrders(dexOptions);
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
        case "deposit":
          result = await deposit(DepositSchema.parse(args), dexOptions);
          break;
        case "withdraw":
          result = await withdraw(WithdrawSchema.parse(args), dexOptions);
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
  const server = await createMcpServer(dexOptions);
  const transport = new StdioServerTransport();

  await server.connect(transport);

  // Handle shutdown
  process.on("SIGINT", async () => {
    await server.close();
    process.exit(0);
  });
}
