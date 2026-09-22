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
 * Widest bid/ask spread that still counts as a price. Past this the midpoint
 * is the average of two unrelated numbers rather than what the asset trades at.
 */
const MAX_REFERENCE_SPREAD_PCT = 0.1;

/**
 * How far from its own touch a resting level may sit and still count toward
 * the notional defending the reference price.
 *
 * Without the band, size parked far below the bid — where it will never be
 * hit, and so costs nothing to leave there — would vouch for a quote it does
 * not actually back.
 */
const DEFENDING_BAND_PCT = 0.02;

export interface SpotReferenceQuote {
  price: number;
  /** The book the price came from, for callers that go on to vet or walk it. */
  snapshot: SpotDepthSnapshot | null;
}

/**
 * Reference price for a spot market, plus the book it was read from.
 *
 * The depth feed is the only source, because it is the only one a caller can
 * then vet — see {@link assertCredibleSpotBook}, which needs the ladder, not
 * just a number. The `market_price` feed is perp-only by design, and the two
 * asset-context fields that look like alternatives are not:
 *
 * - `mid` is the same book computed server-side, so it adds no independent
 *   evidence while arriving without the levels needed to judge it.
 * - `last_price` is worse. Two controlled accounts set it with a single wash
 *   trade on an empty book, and the payload carries no trade timestamp to age
 *   it against — only its own snapshot time — so a print from weeks ago is
 *   indistinguishable from a current one. The web order form accepts it; a CLI
 *   or MCP order, which commits in one step with nothing shown first, must not.
 *
 * Callers are told to name their own price instead.
 */
export async function getSpotReferenceQuote(
  readDex: DecibelReadDex,
  market: SpotMarket,
): Promise<SpotReferenceQuote> {
  const snapshot = await captureSpotDepthSnapshot(
    readDex,
    market.market_addr,
    REFERENCE_PRICE_DEPTH_TIMEOUT_MS,
  ).catch(() => null);

  const price = spotDepthMidPrice(snapshot);
  if (price == null || price <= 0) {
    throw new Error(
      `No price source for spot market "${market.market_name}": the orderbook is not two-sided. Place a limit order with an explicit price instead.`,
    );
  }
  return { price, snapshot };
}

export interface SpotBookCredibilityArgs {
  /** Size times reference price, in quote-asset units. */
  orderNotional: number;
  isBuy: boolean;
  marketName: string;
}

/**
 * Refuse a book too thin or too wide to price a market order against.
 *
 * Spot has no oracle, so the book is the only reference there is and a market
 * order's cap is whatever the book says. That makes the mid worth
 * manipulating: minimum-sized quotes bracketing an arbitrary price cost almost
 * nothing to post and move the cap anywhere.
 *
 * What an attacker cannot fake cheaply is the exposure needed to hold the quote
 * up. Lifting the mid for a victim's buy means resting a bid far above fair
 * value, and that bid is hittable by anyone who notices. So the question asked
 * here is not "is this mid plausible" — unanswerable without a second source —
 * but "is enough real size at risk behind it to make the lie cost more than the
 * trade it would steal", i.e. at least the notional being priced off it.
 *
 * Note which side is checked: a buy is gated on the bids, because the bid is
 * the leg an attacker must overpay on to raise the mid. The asks the buy
 * actually consumes prove nothing — that is where the attacker's inventory sits.
 */
export function assertCredibleSpotBook(
  snapshot: SpotDepthSnapshot | null,
  { orderNotional, isBuy, marketName }: SpotBookCredibilityArgs,
): void {
  const bestBid = snapshot?.bestBid;
  const bestAsk = snapshot?.bestAsk;
  if (!snapshot || bestBid == null || bestAsk == null || bestBid <= 0) {
    throw new Error(
      `Spot market "${marketName}" has no two-sided orderbook to price a market order against. Place a limit order with an explicit price instead.`,
    );
  }

  // Those orders should have matched, so a book quoting them describes a
  // market that does not exist and its midpoint means nothing. trading-api
  // meters this state on the same feed, so it does occur.
  if (bestBid >= bestAsk) {
    throw new Error(
      `Spot market "${marketName}" reports a crossed or locked book (bid ${bestBid} >= ask ${bestAsk}), which has no meaningful midpoint. Place a limit order with an explicit price instead.`,
    );
  }

  const mid = (bestBid + bestAsk) / 2;
  const spread = (bestAsk - bestBid) / mid;
  if (spread > MAX_REFERENCE_SPREAD_PCT) {
    throw new Error(
      `Spot market "${marketName}" has a ${(spread * 100).toFixed(1)}% bid/ask spread (${bestBid} / ${bestAsk}), too wide for its midpoint to be a meaningful price. Place a limit order with an explicit price instead.`,
    );
  }

  const touch = isBuy ? bestBid : bestAsk;
  const defending = isBuy ? snapshot.bids : snapshot.asks;
  const inBand = (price: number) =>
    isBuy ? price >= touch * (1 - DEFENDING_BAND_PCT) : price <= touch * (1 + DEFENDING_BAND_PCT);

  const defendingNotional = defending
    .filter((level) => inBand(level.price))
    .reduce((sum, level) => sum + level.price * level.size, 0);

  if (defendingNotional < orderNotional) {
    throw new Error(
      `Spot market "${marketName}" has only ${defendingNotional.toFixed(2)} of resting ${isBuy ? "bid" : "ask"} liquidity defending its ${mid} midpoint, against an order notional of ${orderNotional.toFixed(2)}. That is too little to trust the midpoint as a price cap. Place a limit order with an explicit price instead.`,
    );
  }
}

/**
 * Worst price the requested size must reach to fill against resting liquidity,
 * or null when the visible ladder cannot bound it.
 *
 * Levels arrive best-first.
 *
 * Depth is aggregated (the subscription asks for the finest bucket), so this is
 * the price of the bucket the fill lands in rather than an exact VWAP — close
 * enough for a cap, which only has to be high enough to clear.
 */
export function executableLimitPrice(
  snapshot: SpotDepthSnapshot | null,
  size: number,
  isBuy: boolean,
): number | null {
  const levels = isBuy ? snapshot?.asks : snapshot?.bids;
  if (!levels || levels.length === 0) return null;

  // Subtracting twenty float sizes accumulates enough error to leave a
  // positive residual on a ladder that exactly covers the order, which would
  // drop the cap entirely.
  const filled = size * 1e-9;

  let remaining = size;
  for (const level of levels) {
    remaining -= level.size;
    if (remaining <= filled) return level.price;
  }

  // The feed truncates each side at MAX_MARKET_DEPTH_LEVELS, so a ladder that
  // runs out is indistinguishable from a book that has. Capping at the worst
  // visible level would strand the order in front of liquidity the caller's
  // slippage already allowed.
  return null;
}

/** 24h change in percent units (5 = +5%), or null without a 24h baseline. */
export function spotChangePct24h(context: SpotAssetContext): number | null {
  if (context.last_price == null || !context.prev_day_price) {
    return null;
  }
  return ((context.last_price - context.prev_day_price) / context.prev_day_price) * 100;
}
