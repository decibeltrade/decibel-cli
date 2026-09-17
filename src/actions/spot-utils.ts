import { AccountAddress } from "@aptos-labs/ts-sdk";
import {
  DecibelReadDex,
  getSpotMarketAddr,
  roundToTickSizeForSide,
  SpotAssetContext,
  SpotMarket,
  UserOpenOrder,
} from "@decibeltrade/sdk";

/**
 * Page size for open-order fetches. `/open_orders` defaults to 10 and caps
 * `limit` at 1000; anything named "all" has to page explicitly or it silently
 * operates on the first ten orders.
 */
const OPEN_ORDERS_PAGE_SIZE = 500;

/** The API's `offset` ceiling, which bounds one sweep at 10_500 orders. */
const OPEN_ORDERS_MAX_OFFSET = 10_000;

export interface SpotOpenOrdersResult {
  orders: UserOpenOrder[];
  /**
   * True when the subaccount has more open orders than one offset sweep can
   * reach. The orders returned are still valid — there are simply more of
   * them, so no caller may treat this list as the complete set.
   */
  truncated: boolean;
}

/**
 * One full sweep of a subaccount's open spot orders, following pagination
 * until the server runs out or `offset` hits its ceiling.
 *
 * Shared by cancellation and listing so "cancel all" and "list orders" can
 * never disagree about how much of the book they can see.
 */
export async function fetchSpotOpenOrders(
  readDex: DecibelReadDex,
  subAddr: string,
): Promise<SpotOpenOrdersResult> {
  const orders: UserOpenOrder[] = [];

  for (let offset = 0; ; offset += OPEN_ORDERS_PAGE_SIZE) {
    // Past the ceiling the remaining orders are unreachable by offset. Report
    // it rather than returning a partial list that looks complete.
    if (offset > OPEN_ORDERS_MAX_OFFSET) return { orders, truncated: true };

    const page = await readDex.userOpenOrders.getByAddr({
      subAddr,
      assetType: "spot",
      limit: OPEN_ORDERS_PAGE_SIZE,
      offset,
    });
    orders.push(...page.items);

    // A short page is the last page — the only termination signal we trust.
    //
    // `total_count` deliberately does NOT end the loop: the endpoint reports
    // it as the size of an over-fetched window (`clamp((limit + offset) * 2,
    // 500, 65535)`), not the true number of open orders. Today's doubling
    // happens to keep it above what we have collected, but stopping on it
    // would make this sweep silently truncate if that factor ever changed.
    // The cost of ignoring it is one extra request when the count is an exact
    // multiple of the page size.
    if (page.items.length < OPEN_ORDERS_PAGE_SIZE) break;
  }

  return { orders, truncated: false };
}

/**
 * A display price converted to the exact chain price the order is submitted
 * at: scaled by the quote decimals and snapped to the tick in the side-safe
 * direction (buys down, sells up).
 *
 * The scaling deliberately keeps its fraction until the tick rounding. Rounding
 * to an integer first can carry the value across a tick boundary — a buy cap of
 * 4.5450996 scales to 4_545_099.6, which nearest-integer rounding turns into
 * the already-aligned 4_545_100, i.e. a price ABOVE the caller's cap that the
 * side-safe pass then has no reason to correct.
 */
export function toSpotChainPrice(price: number, market: SpotMarket, isBuy: boolean): number {
  return roundToTickSizeForSide(price * 10 ** market.px_decimals, market.tick_size, isBuy);
}

export interface SpotDepthSnapshot {
  bids: Array<{ price: number; size: number }>;
  asks: Array<{ price: number; size: number }>;
  bestBid: number | null;
  bestAsk: number | null;
}

/**
 * Case-insensitive; throws if not found.
 *
 * Spot is looked up through `getAllSpot` rather than the shared market list:
 * perp and spot derive different addresses from the same name, so a perp row
 * matched here would send the order to an address that doesn't exist on chain.
 */
export async function findSpotMarket(readDex: DecibelReadDex, symbol: string): Promise<SpotMarket> {
  const market = await lookupSpotMarket(readDex, symbol);
  assertMarketAddrMatchesName(readDex, market);
  return market;
}

/** Does not vet the row's metadata. */
async function lookupSpotMarket(readDex: DecibelReadDex, symbol: string): Promise<SpotMarket> {
  const markets = await readDex.markets.getAllSpot();
  const market = markets.find((m) => m.market_name.toLowerCase() === symbol.toLowerCase());
  if (!market) {
    throw new Error(
      `Spot market "${symbol}" not found. Run "decibel-cli spot markets ls" to see available spot markets.`,
    );
  }
  return market;
}

/**
 * The canonical casing of a listed spot symbol.
 *
 * For callers that need the name only to derive an on-chain address and never
 * read the reported `market_addr`. The address check
 * {@link findSpotMarket} applies guards price discovery, which those callers do
 * not perform, so it is deliberately skipped: letting it reject the row would
 * discard the casing and send the caller back to the symbol as typed, deriving
 * an address that does not exist.
 */
export async function findSpotMarketName(readDex: DecibelReadDex, symbol: string): Promise<string> {
  return (await lookupSpotMarket(readDex, symbol)).market_name;
}

/**
 * Refuse a market row whose `market_addr` is not the address its name derives
 * to on chain.
 *
 * Orders are placed by NAME (the SDK derives the address itself), while price
 * discovery — the depth subscription and the asset-context lookup — is keyed on
 * the `market_addr` the API reported. Those are two different trust paths for
 * one market, and if they disagree we would read one book and trade on another:
 * a stale or tampered row could price an order off an unrelated market while
 * the order itself lands correctly, which no on-chain tick or lot check would
 * catch. Comparing them costs nothing (the derivation is pure) and the write
 * already depends on it being right.
 */
function assertMarketAddrMatchesName(readDex: DecibelReadDex, market: SpotMarket): void {
  const derived = getSpotMarketAddr(market.market_name, readDex.config.deployment.package);
  let reported: AccountAddress;
  try {
    // maxMissingChars accepts short-form addresses, which the SDK's own
    // address comparisons also tolerate.
    reported = AccountAddress.from(market.market_addr, { maxMissingChars: 63 });
  } catch {
    throw new Error(
      `Spot market "${market.market_name}" reported an unparseable address (${market.market_addr}).`,
    );
  }
  if (!derived.equals(reported)) {
    throw new Error(
      `Spot market "${market.market_name}" reports address ${market.market_addr}, which does not match its on-chain address derived from the name (${derived.toString()}). ` +
        "Refusing to trade on a market whose metadata is inconsistent — orders are placed by name, so prices read from the reported address would come from a different market.",
    );
  }
}

export async function findSpotAssetContext(
  readDex: DecibelReadDex,
  marketAddr: string,
): Promise<SpotAssetContext | undefined> {
  const contexts = await readDex.spotAssetContexts.getAll();
  return contexts.find((c) => c.market_addr.toLowerCase() === marketAddr.toLowerCase());
}

/**
 * The length check is load-bearing: this package compiles without
 * `noUncheckedIndexedAccess`, so `levels[0]` is typed as always present and
 * the linter treats an optional chain on it as dead code — while an empty
 * book really does yield `undefined` at runtime.
 */
function topOfBookPrice(levels: Array<{ price: number }>): number | null {
  return levels.length > 0 ? levels[0].price : null;
}

export async function captureSpotDepthSnapshot(
  readDex: DecibelReadDex,
  marketAddr: string,
  timeoutMs: number,
): Promise<SpotDepthSnapshot> {
  // `subscribe` can invoke the callback synchronously (a cached snapshot),
  // i.e. before it returns the unsubscribe handle — so the snapshot is handed
  // back through `deliver`, and teardown runs once the handle exists.
  let deliver: (snapshot: SpotDepthSnapshot) => void = () => undefined;
  const received = new Promise<SpotDepthSnapshot>((resolve) => {
    deliver = resolve;
  });

  const unsubscribe = readDex.marketDepth.subscribeByAddr(marketAddr, 1, (data) => {
    deliver({
      bids: data.bids,
      asks: data.asks,
      bestBid: data.best_bid ?? topOfBookPrice(data.bids),
      bestAsk: data.best_ask ?? topOfBookPrice(data.asks),
    });
  });

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined = undefined;
  const timedOut = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`Timed out waiting for spot orderbook data (${marketAddr})`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([received, timedOut]);
  } finally {
    clearTimeout(timeoutHandle);
    unsubscribe();
  }
}

/**
 * Mid of a two-sided book, else null.
 *
 * A one-sided book deliberately yields no price. The lone quote is set by
 * whoever posted it, and a market order derives its IOC cap from this value —
 * so honouring it would let that party name the price the order pays on a thin
 * book. Callers fall through to the asset-context mid (which itself requires
 * both sides) and then the last trade.
 *
 * This is stricter than the web order form, which accepts the surviving side:
 * there the price is on screen before the user confirms, whereas a CLI or MCP
 * market order commits in one step with nothing shown first.
 */
export function spotDepthMidPrice(snapshot: SpotDepthSnapshot | null): number | null {
  if (!snapshot) return null;
  const { bestBid, bestAsk } = snapshot;
  if (bestBid != null && bestAsk != null) return (bestBid + bestAsk) / 2;
  return null;
}

/** Timeout for the depth snapshot behind a market order's price cap. */
const REFERENCE_PRICE_DEPTH_TIMEOUT_MS = 3_000;

/**
 * Reference price for a spot market, matching the web order form
 * (`useSpotBookMidPrice`): the `market_price` feed is perp-only by design, so
 * the price comes from the depth feed, falling back to the asset-context mid
 * and then the last trade. Both sources are fetched concurrently so a silent depth
 * subscription costs the timeout, not the timeout plus an HTTP round-trip.
 *
 * Throws rather than guessing when no source has a price — the caller would
 * otherwise submit an order priced off nothing.
 */
export async function getSpotReferencePrice(
  readDex: DecibelReadDex,
  market: SpotMarket,
): Promise<number> {
  const [snapshot, context] = await Promise.all([
    captureSpotDepthSnapshot(readDex, market.market_addr, REFERENCE_PRICE_DEPTH_TIMEOUT_MS).catch(
      () => null,
    ),
    findSpotAssetContext(readDex, market.market_addr).catch(() => undefined),
  ]);

  const price = spotDepthMidPrice(snapshot) ?? context?.mid ?? context?.last_price;
  if (price == null || price <= 0) {
    throw new Error(
      `No price source for spot market "${market.market_name}": the orderbook is empty and there is no recent trade. Place a limit order with an explicit price instead.`,
    );
  }
  return price;
}

/** 24h change in percent units (5 = +5%), or null without a 24h baseline. */
export function spotChangePct24h(context: SpotAssetContext): number | null {
  if (context.last_price == null || !context.prev_day_price) {
    return null;
  }
  return ((context.last_price - context.prev_day_price) / context.prev_day_price) * 100;
}
