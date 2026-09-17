import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it, vi } from "vitest";

const spotActions = vi.hoisted(() => ({
  placeSpotLimitOrder: vi.fn(() =>
    Promise.resolve({ success: true, orderId: "1", pendingCbs: false, transactionHash: "0xhash" }),
  ),
  placeSpotMarketOrder: vi.fn(() =>
    Promise.resolve({ success: true, orderId: "1", pendingCbs: true, transactionHash: "0xhash" }),
  ),
  cancelSpotOrder: vi.fn(() => Promise.resolve({ success: true, transactionHash: "0xhash" })),
  cancelAllSpotOrders: vi.fn(() => Promise.resolve({ cancelled: 0, failed: 0, total: 0 })),
  getSpotMarkets: vi.fn(() => Promise.resolve({ markets: [] })),
  getSpotPrice: vi.fn(() => Promise.resolve({ symbol: "APT/USDC" })),
  getSpotOrderbook: vi.fn(() => Promise.resolve({ symbol: "APT/USDC", bids: [], asks: [] })),
  getSpotOrders: vi.fn(() => Promise.resolve({ orders: { items: [] } })),
  getSpotBalances: vi.fn(() => Promise.resolve({ positions: [] })),
  getSpotTradeHistory: vi.fn(() => Promise.resolve({ trades: [] })),
  getSpotOrderHistory: vi.fn(() => Promise.resolve({ orders: [] })),
}));

vi.mock("../../src/services/dex-factory.js", () => ({
  createReadDex: vi.fn(),
  createWriteDex: vi.fn(),
  resolveSubaccountAddress: vi.fn(() => "0xsubaccount"),
  getConfig: vi.fn(() => ({})),
}));

vi.mock("../../src/actions/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/actions/index.js")>();
  return { ...actual, ...spotActions };
});

import { createMcpServer } from "../../src/mcp/server.js";

type Handler = (request: unknown) => Promise<unknown> | unknown;

/**
 * The Server keeps its handlers private, so reach through the same map the
 * transport dispatches on rather than standing up a stdio pair.
 */
function handlersOf(server: ReturnType<typeof createMcpServer>): Map<string, Handler> {
  return (server as unknown as { _requestHandlers: Map<string, Handler> })._requestHandlers;
}

async function listTools() {
  const server = createMcpServer();
  const handler = handlersOf(server).get(ListToolsRequestSchema.shape.method.value);
  const result = (await handler?.({ method: "tools/list", params: {} })) as {
    tools: Array<{ name: string; inputSchema: { required?: string[] } }>;
  };
  return result.tools;
}

async function callTool(name: string, args: Record<string, unknown>) {
  const server = createMcpServer();
  const handler = handlersOf(server).get(CallToolRequestSchema.shape.method.value);
  return (await handler?.({
    method: "tools/call",
    params: { name, arguments: args },
  })) as { isError?: boolean; content: Array<{ text: string }> };
}

const SPOT_TOOLS = [
  "place_spot_limit_order",
  "place_spot_market_order",
  "cancel_spot_order",
  "cancel_all_spot_orders",
  "get_spot_markets",
  "get_spot_price",
  "get_spot_orderbook",
  "get_spot_orders",
  "get_spot_balances",
  "get_spot_trade_history",
  "get_spot_order_history",
];

describe("MCP spot tools", () => {
  it("advertises every spot tool", async () => {
    const names = (await listTools()).map((t) => t.name);
    for (const tool of SPOT_TOOLS) {
      expect(names).toContain(tool);
    }
  });

  it("keeps the perp tools untouched", async () => {
    const names = (await listTools()).map((t) => t.name);
    expect(names).toContain("place_limit_order");
    expect(names).toContain("get_positions");
  });

  // A tool advertised but missing from the dispatch switch answers every call
  // with "Unknown tool", which an agent only discovers at trade time.
  it.each(SPOT_TOOLS)("dispatches %s instead of falling through to Unknown tool", async (name) => {
    const response = await callTool(name, {
      side: "buy",
      size: 1,
      symbol: "APT/USDC",
      price: 5,
      orderId: "1",
    });
    expect(response.content[0]?.text).not.toContain("Unknown tool");
    expect(response.isError).toBeFalsy();
  });

  // The declaration list and the dispatch switch are two hand-maintained
  // representations of the same 36 tools, so this walks EVERY advertised tool
  // (perp included) rather than only the ones this change added. Perp actions
  // are unmocked here and will fail on the stubbed dex factory — that is fine
  // and is the point: any error other than "Unknown tool" proves the name
  // reached a dispatch case.
  it("dispatches every advertised tool, including ones this change did not add", async () => {
    const tools = await listTools();
    expect(tools.length).toBeGreaterThan(SPOT_TOOLS.length);

    const undispatched: string[] = [];
    for (const { name } of tools) {
      const response = await callTool(name, {
        side: "buy",
        size: 1,
        symbol: "APT/USDC",
        price: 5,
        leverage: 2,
        orderId: "1",
        marginType: "cross",
      });
      if (response.content[0]?.text.includes("Unknown tool")) {
        undispatched.push(name);
      }
    }

    expect(undispatched).toEqual([]);
  });

  it("rejects long/short on spot, which has no position side", async () => {
    const response = await callTool("place_spot_limit_order", {
      side: "long",
      size: 1,
      symbol: "APT/USDC",
      price: 5,
    });
    expect(response.isError).toBe(true);
    expect(spotActions.placeSpotLimitOrder).not.toHaveBeenCalledWith(
      expect.objectContaining({ side: "long" }),
      expect.anything(),
    );
  });

  it("surfaces pendingCbs to the agent in the market-order response", async () => {
    const response = await callTool("place_spot_market_order", {
      side: "buy",
      size: 1,
      symbol: "APT/USDC",
    });
    expect(JSON.parse(response.content[0]?.text ?? "{}")).toMatchObject({ pendingCbs: true });
  });

  it("requires symbol on the spot market-data tools", async () => {
    const tools = await listTools();
    for (const name of ["get_spot_price", "get_spot_orderbook"]) {
      expect(tools.find((t) => t.name === name)?.inputSchema.required).toContain("symbol");
    }
  });
});
