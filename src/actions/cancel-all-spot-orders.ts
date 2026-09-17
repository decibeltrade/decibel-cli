import { z } from "zod";

import {
  createReadDex,
  createWriteDex,
  DexOptions,
  resolveSubaccountAddress,
} from "../services/dex-factory.js";
import { fetchSpotOpenOrders, findSpotMarket } from "./spot-utils.js";

export const CancelAllSpotOrdersSchema = z.object({
  symbol: z.string().optional().describe("Only cancel orders for a specific spot market"),
});

export type CancelAllSpotOrdersParams = z.infer<typeof CancelAllSpotOrdersSchema>;

export interface CancelAllSpotOrdersResult {
  cancelled: number;
  failed: number;
  total: number;
}

/** Test seam: lets the suite run the stall backoff without real waiting. */
export interface CancelAllSpotOrdersDeps {
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Guard against a pathological loop (something re-placing orders as fast as we
 * cancel them). Each pass clears up to 10_500 orders, so this is far beyond any
 * real account.
 */
const MAX_PASSES = 100;

/**
 * Backoff for a stalled read. The open-orders endpoint is served from
 * ClickHouse, which lags the chain, so right after a large sweep the window can
 * still be full of orders we already cancelled. Waiting lets the indexer catch
 * up and reveal what is behind them.
 */
const STALL_BACKOFF_MS = [250, 500, 1_000, 2_000, 4_000];

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Cancellation runs in passes rather than one sweep because `offset`
 * pagination tops out at 10_500 orders: cancelling that many and reporting
 * completion would quietly leave the rest resting. Each pass re-reads from
 * offset zero, so orders the previous window could not reach come into view
 * once the ones ahead of them are gone.
 *
 * Orders this run already cancelled are never re-submitted. That matters
 * because the read side lags the chain: a stale window republishes cancelled
 * orders, and re-cancelling them fails, which would otherwise look like "no
 * progress" and end the run with orders still open. A window that holds
 * nothing but already-cancelled orders is a stall, not completion — it waits
 * for the indexer and, failing that, raises rather than reporting a sweep it
 * cannot verify.
 *
 * One case is genuinely unreachable: `--market` filtering happens client-side
 * (the endpoint takes no market parameter), so if the window is entirely other
 * markets' orders, the matching ones behind it can never be paged to. That
 * raises immediately rather than backing off, since nothing will change — and
 * it is reached most often AFTER cancelling the matching orders that were
 * visible, so the error leads with that count rather than reading as a total
 * failure.
 */
export async function cancelAllSpotOrders(
  params: CancelAllSpotOrdersParams,
  dexOptions: DexOptions = {},
  deps: CancelAllSpotOrdersDeps = {},
): Promise<CancelAllSpotOrdersResult> {
  const sleep = deps.sleep ?? defaultSleep;
  const subaccountAddr = resolveSubaccountAddress(dexOptions);
  const readDex = createReadDex(dexOptions);

  const marketAddr = params.symbol
    ? (await findSpotMarket(readDex, params.symbol)).market_addr.toLowerCase()
    : undefined;

  // Tracked by order id: an order retried across passes counts once, and an id
  // in `cancelled` is never submitted again.
  const cancelledIds = new Set<string>();
  const attemptedIds = new Set<string>();
  let writeDex: Awaited<ReturnType<typeof createWriteDex>> | undefined;
  let stalls = 0;

  const result = (): CancelAllSpotOrdersResult => ({
    cancelled: cancelledIds.size,
    failed: attemptedIds.size - cancelledIds.size,
    total: attemptedIds.size,
  });

  // Both non-completion paths lead with the confirmed count: cancellation is
  // partial far more often than it is all-or-nothing, and an error that omits
  // what it achieved reads as a total failure.
  const incomplete = (reason: string): Error =>
    new Error(
      `Incomplete: cancelled ${cancelledIds.size} spot order(s), but ${reason}. Re-run to continue.`,
    );

  /** Distinct prefix from `Incomplete:` because this one is NOT retryable. */
  const unreachable = (visible: number): Error =>
    new Error(
      `Unreachable: cancelled ${cancelledIds.size} spot order(s) on ${params.symbol}, but cannot reach the rest. ` +
        `This subaccount has more open spot orders than the API can page through, none of the ${visible} currently in view are on ${params.symbol}, ` +
        "and the market filter is applied client-side. Re-running this command reads the same window. " +
        `Cancel the remainder individually with "decibel-cli spot cancel <orderId> --market ${params.symbol}". ` +
        '("decibel-cli spot cancel-all" with no --market would reach them, but it also cancels your orders on every other market.)',
    );

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const { orders, truncated } = await fetchSpotOpenOrders(readDex, subaccountAddr);
    const batch = marketAddr ? orders.filter((o) => o.market.toLowerCase() === marketAddr) : orders;
    const actionable = batch.filter((o) => !cancelledIds.has(o.order_id));

    if (actionable.length === 0) {
      // Every order in view is one we already cancelled (or there are none).
      if (!truncated) return result();

      // The market filter is applied after pagination — `/open_orders` has no
      // market parameter — so a window packed with other markets' orders hides
      // every matching order behind the offset ceiling. Those orders are not
      // ours to cancel, so the window never moves and no number of passes (or
      // re-runs) makes progress. Say that plainly instead of retrying.
      if (marketAddr !== undefined && batch.length === 0) {
        throw unreachable(orders.length);
      }

      // The window is full, so more orders exist behind it — but all we can
      // see is our own stale rows. Give the indexer a chance to advance.
      if (stalls >= STALL_BACKOFF_MS.length) {
        throw incomplete(
          "could not confirm the remaining orders: the open-orders feed still only shows orders this run already cancelled",
        );
      }
      await sleep(STALL_BACKOFF_MS[stalls]);
      stalls++;
      continue;
    }

    stalls = 0;
    writeDex ??= await createWriteDex(dexOptions);

    let cancelledThisPass = 0;
    for (const order of actionable) {
      attemptedIds.add(order.order_id);
      try {
        await writeDex.cancelSpotOrder({
          orderId: order.order_id,
          marketAddr: order.market,
          subaccountAddr,
        });
        cancelledIds.add(order.order_id);
        cancelledThisPass++;
      } catch {
        // Retried on the next pass; counted as failed only if it survives.
      }
    }

    if (cancelledThisPass === 0) {
      // Nothing here can be cancelled. With a full window there are orders
      // beyond it we never even saw, so this is not a clean sweep.
      if (truncated) {
        throw incomplete("could not cancel any of the orders currently visible");
      }
      return result();
    }
  }

  throw incomplete(`orders remained after ${MAX_PASSES} passes`);
}
