import { describe, expect, it, vi } from "vitest";

/** Test deployment package, and the addresses spot markets derive from it. */
const PKG = "0x0000000000000000000000000000000000000000000000000000000000000123";
const APT_ADDR = "0xa0769cb4de927021e407bf1023d0aaf60f08503abc0c69b03796e68813e25038";
const ETH_ADDR = "0xfd7e84e3f3f98be6495f36cc35c6eee32def524caab2e46f9e5eb46fe56dca26";

const spotMarket = {
  asset_type: "spot" as const,
  market_name: "APT/USDC",
  market_addr: APT_ADDR,
  max_leverage: 0,
  tick_size: 100,
  min_size: 1e9,
  lot_size: 1e7,
  max_open_interest: 0,
  sz_decimals: 8,
  px_decimals: 6,
  mode: "Open",
};

const openOrders = vi.hoisted(() => vi.fn());
const cancelAll = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ cancelled: 0, failed: 0, total: 0 })),
);
const prompt = vi.hoisted(() => vi.fn(() => Promise.resolve({ confirm: false })));

vi.mock("inquirer", () => ({ default: { prompt } }));

vi.mock("@decibeltrade/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@decibeltrade/sdk")>();
  return {
    addressComparisonKey: actual.addressComparisonKey,
    addressesEqual: actual.addressesEqual,
    roundToTickSizeForSide: actual.roundToTickSizeForSide,
    getSpotMarketAddr: actual.getSpotMarketAddr,
    TimeInForce: { GoodTillCanceled: 0, PostOnly: 1, ImmediateOrCancel: 2 },
    DecibelReadDex: vi.fn(),
    DecibelWriteDex: vi.fn(),
  };
});

vi.mock("../../src/services/dex-factory.js", () => ({
  createReadDex: vi.fn(() => ({
    config: { deployment: { package: PKG } },
    markets: { getAllSpot: vi.fn(() => Promise.resolve([spotMarket])) },
    userOpenOrders: { getByAddr: openOrders },
  })),
  createWriteDex: vi.fn(),
  resolveSubaccountAddress: vi.fn(() => "0xsub"),
  getConfig: vi.fn(() => ({})),
}));

vi.mock("../../src/actions/cancel-all-spot-orders.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/actions/cancel-all-spot-orders.js")>();
  return { ...actual, cancelAllSpotOrders: cancelAll };
});

import { createSpotCommand } from "../../src/commands/spot/index.js";

/** Run the command, capturing output and the process.exit code instead of exiting. */
async function run(args: string[]) {
  const lines: string[] = [];
  const capture = (...a: unknown[]) => void lines.push(a.map(String).join(" "));
  const log = vi.spyOn(console, "log").mockImplementation(capture);
  const err = vi.spyOn(console, "error").mockImplementation(capture);
  let exitCode: number | undefined;
  const exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    exitCode ??= code;
    throw new Error("__exit__");
  }) as never);

  try {
    await createSpotCommand().parseAsync(["node", "spot", ...args]);
  } catch (e) {
    if (!(e instanceof Error) || e.message !== "__exit__") throw e;
  } finally {
    log.mockRestore();
    err.mockRestore();
    exit.mockRestore();
  }

  const ANSI = new RegExp(String.fromCharCode(27) + "\\[\\d+m", "g");
  return { output: lines.join("\n").replace(ANSI, ""), exitCode };
}

/** One page of open orders, all on the given market. */
function page(count: number, market: string, totalCount = count) {
  return {
    items: Array.from({ length: count }, (_, i) => ({
      order_id: String(i),
      market,
      asset_type: "spot",
    })),
    total_count: totalCount,
  };
}

describe("spot cancel-all confirmation preview", () => {
  // --yes went through findSpotMarket and errored on a bad symbol, while the
  // interactive path silently printed "no orders" — the flag must not change
  // whether the symbol is validated.
  it("rejects an unknown market symbol instead of reporting no orders", async () => {
    openOrders.mockResolvedValue(page(3, APT_ADDR));

    const { output, exitCode } = await run(["cancel-all", "--market", "APTT/USDC"]);

    expect(output).not.toMatch(/No open spot orders/);
    expect(output).toMatch(/Spot market "APTT\/USDC" not found/);
    expect(exitCode).toBe(1);
    expect(prompt).not.toHaveBeenCalled();
    expect(cancelAll).not.toHaveBeenCalled();
  });

  it("reports no orders only when the account really has none", async () => {
    openOrders.mockResolvedValue({ items: [], total_count: 0 });

    const { output } = await run(["cancel-all", "--market", "APT/USDC"]);

    expect(output).toMatch(/No open spot orders to cancel/);
    expect(cancelAll).not.toHaveBeenCalled();
  });

  // A full window means matching orders may sit past it; "none" would be a lie.
  it("does not claim no orders when the window is truncated", async () => {
    // Full pages all the way to the offset ceiling, with a total the sweep can
    // never reach — the account has more orders than pagination exposes.
    openOrders.mockResolvedValue(page(500, ETH_ADDR, 11_000));

    const { output, exitCode } = await run(["cancel-all", "--market", "APT/USDC"]);

    expect(output).not.toMatch(/No open spot orders/);
    expect(output).toMatch(/cannot be reached by a filtered cancel/i);
    expect(output).not.toMatch(/Re-run with --yes/);
    expect(exitCode).toBe(1);
  });

  // Orders parked in the on-chain pending-CBS queue are absent from the
  // open-orders feed, so a sweep cannot see or cancel them. They drain and
  // execute later — reporting a bare "cancelled N" invites the caller to
  // believe they are flat when a trade is still pending.
  it("warns that CBS-queued orders are not covered by the sweep", async () => {
    openOrders.mockResolvedValue({ items: [], total_count: 0 });
    cancelAll.mockResolvedValueOnce({ cancelled: 3, failed: 0, total: 3 });

    const { output } = await run(["cancel-all", "--yes"]);

    expect(output).toMatch(/Cancelled 3 spot order\(s\)/);
    expect(output).toMatch(/queued behind a collateral withdrawal/i);
    expect(output).toMatch(/spot cancel <orderId>/);
  });

  it("omits the caveat when there was nothing to cancel", async () => {
    openOrders.mockResolvedValue({ items: [], total_count: 0 });
    cancelAll.mockResolvedValueOnce({ cancelled: 0, failed: 0, total: 0 });

    const { output } = await run(["cancel-all", "--yes"]);

    expect(output).toMatch(/No open spot orders to cancel/);
    expect(output).not.toMatch(/queued behind a collateral withdrawal/i);
  });

  it("prompts with the visible count when the account fits in one window", async () => {
    openOrders.mockResolvedValue(page(3, APT_ADDR));

    await run(["cancel-all", "--market", "APT/USDC"]);

    expect(prompt).toHaveBeenCalledWith([
      expect.objectContaining({ message: "Cancel 3 spot order(s)?" }),
    ]);
  });
});
