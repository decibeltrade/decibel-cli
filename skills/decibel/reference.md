# Decibel CLI Reference

Complete command reference for the Decibel CLI.

## Global Options

These options can be used with any command:

| Option              | Description                         |
| ------------------- | ----------------------------------- |
| `--json`            | Output in JSON format for scripting |
| `--network <name>`  | Network: mainnet, testnet, local    |
| `--account <alias>` | Use specific account                |
| `-V, --version`     | Show version number                 |
| `-h, --help`        | Show help                           |

---

## Account Management

Commands for managing trading accounts stored locally in `~/.decibel/data.db`.

Accounts use **API wallets** created at [app.decibel.trade/api](https://app.decibel.trade/api) to sign transactions on behalf of your Decibel subaccount. API wallets allow trading but cannot deposit or withdraw funds.

### `decibel-cli account add`

Interactive wizard to add a new account.

**Process:**

1. Choose account type (API wallet for trading, read-only for monitoring)
2. Enter subaccount address
3. Enter API wallet private key (for API wallet type)
4. Set an alias for easy identification
5. Optionally set as default account

**Example:**

```bash
decibel-cli account add
# Follow interactive prompts
```

### `decibel-cli account ls`

List all configured accounts.

**Output columns:**

- Alias
- Address (truncated subaccount address)
- Type (api-wallet or read-only)
- Default status

**Example:**

```bash
decibel-cli account ls
decibel-cli account ls --json
```

**JSON output:**

```json
[
  {
    "alias": "main",
    "address": "0x1234...abcd",
    "type": "api-wallet",
    "isDefault": true
  }
]
```

### `decibel-cli account set-default [alias]`

Set which account to use by default.

```bash
decibel-cli account set-default
decibel-cli account set-default main
```

### `decibel-cli account remove [alias]`

Remove an account from local storage.

**Options:**

| Option      | Description       |
| ----------- | ----------------- |
| `-y, --yes` | Skip confirmation |

```bash
decibel-cli account remove
decibel-cli account remove main -y
```

### `decibel-cli account info`

Show account balances and equity.

**Options:**

| Option              | Description      |
| ------------------- | ---------------- |
| `--json`            | JSON output      |
| `--account <alias>` | Specific account |
| `--network <name>`  | Network to use   |

**Example:**

```bash
decibel-cli account info
decibel-cli account info --json
```

---

## Trading Commands

### `decibel-cli trade order limit <side> <size> <symbol> <price>`

Place a limit order.

**Arguments:**

| Argument | Description                       |
| -------- | --------------------------------- |
| `side`   | `buy`, `sell`, `long`, or `short` |
| `size`   | Order size                        |
| `symbol` | Market symbol (e.g., BTC/USD)     |
| `price`  | Limit price                       |

**Options:**

| Option             | Description                                        |
| ------------------ | -------------------------------------------------- |
| `--tif <tif>`      | Time-in-force: `gtc` (default), `post-only`, `ioc` |
| `--reduce-only`    | Reduce-only order                                  |
| `--client-id <id>` | Client order ID                                    |

**Examples:**

```bash
# Buy 0.01 BTC at $50,000
decibel-cli trade order limit buy 0.01 BTC/USD 50000

# Post-only sell order
decibel-cli trade order limit sell 0.05 ETH/USD 3500 --tif post-only

# Reduce-only order
decibel-cli trade order limit sell 0.01 BTC/USD 55000 --reduce-only
```

**JSON output:**

```json
{
  "success": true,
  "orderId": "12345",
  "transactionHash": "0xabc..."
}
```

### `decibel-cli trade order market <side> <size> <symbol>`

Place a market order.

**Arguments:**

| Argument | Description                       |
| -------- | --------------------------------- |
| `side`   | `buy`, `sell`, `long`, or `short` |
| `size`   | Order size                        |
| `symbol` | Market symbol                     |

**Options:**

| Option             | Description                       |
| ------------------ | --------------------------------- |
| `--slippage <pct>` | Slippage percentage (default: 1%) |
| `--reduce-only`    | Reduce-only order                 |

**Examples:**

```bash
decibel-cli trade order market buy 0.01 BTC/USD
decibel-cli trade order market sell 0.1 ETH/USD --slippage 0.5
```

### `decibel-cli trade order stop-limit <side> <size> <symbol> <price> <stopPrice>`

Place a stop limit order. Triggers at stop price, then posts as a limit order.

**Arguments:**

| Argument    | Description                                 |
| ----------- | ------------------------------------------- |
| `side`      | `buy`, `sell`, `long`, or `short`           |
| `size`      | Order size                                  |
| `symbol`    | Market symbol                               |
| `price`     | Limit price (execution price after trigger) |
| `stopPrice` | Stop trigger price                          |

**Options:**

| Option             | Description                                        |
| ------------------ | -------------------------------------------------- |
| `--tif <tif>`      | Time-in-force: `gtc` (default), `post-only`, `ioc` |
| `--reduce-only`    | Reduce-only order                                  |
| `--client-id <id>` | Client order ID                                    |

**Examples:**

```bash
# Stop loss: sell if BTC drops to 60000, limit at 59000
decibel-cli trade order stop-limit sell 0.01 BTC/USD 59000 60000

# Stop entry: buy if BTC breaks above 70000
decibel-cli trade order stop-limit buy 0.01 BTC/USD 70500 70000
```

### `decibel-cli trade order stop-market <side> <size> <symbol> <stopPrice>`

Place a stop market order. Triggers at stop price, then executes immediately with slippage.

**Arguments:**

| Argument    | Description                       |
| ----------- | --------------------------------- |
| `side`      | `buy`, `sell`, `long`, or `short` |
| `size`      | Order size                        |
| `symbol`    | Market symbol                     |
| `stopPrice` | Stop trigger price                |

**Options:**

| Option             | Description                                       |
| ------------------ | ------------------------------------------------- |
| `--slippage <pct>` | Slippage percentage from stop price (default: 1%) |
| `--reduce-only`    | Reduce-only order                                 |
| `--client-id <id>` | Client order ID                                   |

**Examples:**

```bash
decibel-cli trade order stop-market sell 0.01 BTC/USD 60000
decibel-cli trade order stop-market sell 0.01 BTC/USD 60000 --reduce-only --slippage 2
```

### `decibel-cli trade order twap <side> <size> <symbol>`

Place a TWAP (Time-Weighted Average Price) order. Splits execution over a duration at regular intervals.

**Arguments:**

| Argument | Description                       |
| -------- | --------------------------------- |
| `side`   | `buy`, `sell`, `long`, or `short` |
| `size`   | Total order size                  |
| `symbol` | Market symbol                     |

**Required options:**

| Option                  | Description                   |
| ----------------------- | ----------------------------- |
| `--duration <seconds>`  | Total duration (120s–86400s)  |
| `--frequency <seconds>` | Execution frequency (min 60s) |

**Options:**

| Option             | Description       |
| ------------------ | ----------------- |
| `--reduce-only`    | Reduce-only order |
| `--client-id <id>` | Client order ID   |

**Examples:**

```bash
# Buy 1 BTC over 1 hour, executing every minute
decibel-cli trade order twap buy 1 BTC/USD --duration 3600 --frequency 60

# Sell 10 ETH over 30 minutes, every 5 minutes
decibel-cli trade order twap sell 10 ETH/USD --duration 1800 --frequency 300
```

### `decibel-cli trade close <symbol>`

Close an open position with a reduce-only market order.

**Arguments:**

| Argument | Description   |
| -------- | ------------- |
| `symbol` | Market symbol |

**Options:**

| Option             | Description                                 |
| ------------------ | ------------------------------------------- |
| `--slippage <pct>` | Slippage percentage (default: 1%)           |
| `--size <size>`    | Partial close size (default: full position) |

**Examples:**

```bash
decibel-cli trade close BTC/USD
decibel-cli trade close ETH/USD --size 0.5
```

### `decibel-cli trade cancel <orderId>`

Cancel an order by ID.

**Required options:**

| Option              | Description   |
| ------------------- | ------------- |
| `--market <symbol>` | Market symbol |

**Example:**

```bash
decibel-cli trade cancel 12345 --market BTC/USD
```

### `decibel-cli trade cancel-twap <orderId>`

Cancel an active TWAP order.

**Required options:**

| Option              | Description   |
| ------------------- | ------------- |
| `--market <symbol>` | Market symbol |

**Example:**

```bash
decibel-cli trade cancel-twap 67890 --market BTC/USD
```

### `decibel-cli trade cancel-all`

Cancel all open orders.

**Options:**

| Option              | Description                            |
| ------------------- | -------------------------------------- |
| `--market <symbol>` | Only cancel orders for specific market |
| `-y, --yes`         | Skip confirmation                      |

**Examples:**

```bash
decibel-cli trade cancel-all
decibel-cli trade cancel-all --market BTC/USD -y
```

### `decibel-cli trade tp-sl set <symbol>`

Set take-profit and/or stop-loss for a position. Omit size options to apply to the full position.

**Arguments:**

| Argument | Description   |
| -------- | ------------- |
| `symbol` | Market symbol |

**Options:**

| Option                 | Description                               |
| ---------------------- | ----------------------------------------- |
| `--tp-trigger <price>` | Take-profit trigger price                 |
| `--tp-limit <price>`   | Take-profit limit price                   |
| `--tp-size <size>`     | Take-profit size (omit for full position) |
| `--sl-trigger <price>` | Stop-loss trigger price                   |
| `--sl-limit <price>`   | Stop-loss limit price                     |
| `--sl-size <size>`     | Stop-loss size (omit for full position)   |

**Examples:**

```bash
# Set both TP and SL for full position
decibel-cli trade tp-sl set BTC/USD --tp-trigger 100000 --tp-limit 99500 --sl-trigger 60000 --sl-limit 59500

# Set only stop-loss for partial size
decibel-cli trade tp-sl set ETH/USD --sl-trigger 3200 --sl-limit 3100 --sl-size 0.5
```

### `decibel-cli trade tp-sl ls <symbol>`

List TP/SL orders for a position.

**Example:**

```bash
decibel-cli trade tp-sl ls BTC/USD
```

### `decibel-cli trade tp-sl cancel <orderId>`

Cancel a TP/SL order.

**Required options:**

| Option              | Description   |
| ------------------- | ------------- |
| `--market <symbol>` | Market symbol |

**Example:**

```bash
decibel-cli trade tp-sl cancel 12345 --market BTC/USD
```

### `decibel-cli trade set-leverage <symbol> <leverage>`

Set leverage for a market.

**Arguments:**

| Argument   | Description                               |
| ---------- | ----------------------------------------- |
| `symbol`   | Market symbol                             |
| `leverage` | Leverage value (1-50 depending on market) |

**Options:**

| Option       | Description                |
| ------------ | -------------------------- |
| `--cross`    | Use cross margin (default) |
| `--isolated` | Use isolated margin        |

**Examples:**

```bash
decibel-cli trade set-leverage BTC/USD 10
decibel-cli trade set-leverage ETH/USD 5 --isolated
```

### `decibel-cli trade set-margin <symbol> <type>`

Switch margin type for a market. Preserves current leverage setting.

**Arguments:**

| Argument | Description           |
| -------- | --------------------- |
| `symbol` | Market symbol         |
| `type`   | `cross` or `isolated` |

**Examples:**

```bash
decibel-cli trade set-margin BTC/USD isolated
decibel-cli trade set-margin ETH/USD cross
```

### `decibel-cli trade positions`

View open positions.

**Options:**

| Option        | Description       |
| ------------- | ----------------- |
| `-w, --watch` | Real-time updates |
| `--json`      | JSON output       |

**Output columns:**

- Market
- Side (long/short)
- Size
- Entry Price
- Mark Price
- Unrealized PnL
- Leverage
- Liquidation Price

**Examples:**

```bash
decibel-cli trade positions
decibel-cli trade positions -w
decibel-cli trade positions --json
```

### `decibel-cli trade orders`

View open orders.

**Options:**

| Option        | Description       |
| ------------- | ----------------- |
| `-w, --watch` | Real-time updates |
| `--json`      | JSON output       |

**Examples:**

```bash
decibel-cli trade orders
decibel-cli trade orders -w
```

### `decibel-cli trade history`

View trade history.

**Options:**

| Option        | Description                            |
| ------------- | -------------------------------------- |
| `--limit <n>` | Number of trades to show (default: 20) |
| `--json`      | JSON output                            |

### `decibel-cli trade order-history`

View order history (all order states including filled, cancelled, etc.).

**Options:**

| Option        | Description                            |
| ------------- | -------------------------------------- |
| `--limit <n>` | Number of orders to show (default: 20) |
| `--json`      | JSON output                            |

### `decibel-cli trade active-twaps`

View active TWAP orders.

### `decibel-cli trade twap-history`

View TWAP order history (completed and cancelled).

**Options:**

| Option        | Description                                 |
| ------------- | ------------------------------------------- |
| `--limit <n>` | Number of TWAP orders to show (default: 20) |
| `--json`      | JSON output                                 |

### `decibel-cli trade funding-history`

View funding rate payment history.

**Options:**

| Option        | Description                             |
| ------------- | --------------------------------------- |
| `--limit <n>` | Number of records to show (default: 20) |
| `--json`      | JSON output                             |

---

## Market Information

### `decibel-cli markets ls`

List all available perp markets. For spot, see `decibel-cli spot markets ls`.

**Output includes:**

- Market name
- Max leverage
- Tick size and min size, normalized to order units (quote units for the tick,
  base units for sizes)
- Mode (Open, ReduceOnly, etc.)

The `--json` output additionally carries `rawTickSize`, `rawMinSize` and
`rawLotSize` — the on-chain integer forms, which are 6-10 orders of magnitude
larger. Compare an order against the normalized fields, never the raw ones.

**Examples:**

```bash
decibel-cli markets ls
decibel-cli markets ls --json
```

### `decibel-cli markets price <symbol>`

Get current price for a market.

**Options:**

| Option        | Description             |
| ------------- | ----------------------- |
| `-w, --watch` | Real-time price updates |
| `--json`      | JSON output             |

**Examples:**

```bash
decibel-cli markets price BTC/USD
decibel-cli markets price ETH/USD -w
```

**JSON output:**

```json
{
  "symbol": "BTC/USD",
  "markPrice": 50000.0,
  "indexPrice": 50010.0,
  "fundingRate": 0.0001,
  "openInterest": 1000000
}
```

### `decibel-cli markets book <symbol>`

View order book for a market.

**Options:**

| Option        | Description                    |
| ------------- | ------------------------------ |
| `-w, --watch` | Real-time order book updates   |
| `--depth <n>` | Number of levels (default: 10) |
| `--json`      | JSON output                    |

**Output includes:**

- Bid/ask levels with size
- Visual depth bars
- Spread calculation

**Examples:**

```bash
decibel-cli markets book BTC/USD
decibel-cli markets book ETH/USD -w --depth 20
```

---

## Spot Trading

Spot and perps are separate products. A symbol belongs to one or the other, and
the `trade` commands will not find a spot market (nor the `spot` commands a perp
one) — `decibel-cli spot markets ls` lists what is tradable here.

Spot differs from perps in ways that shape the command surface:

- **No leverage, no positions.** You hold the asset outright; `spot balances`
  shows holdings rather than positions.
- **No reduce-only, TP/SL, TWAP or client order id.** The on-chain entry
  function takes price, size, side and time-in-force only, so those flags are
  absent rather than accepted and ignored.
- **Sizes are base-asset units, prices quote-asset units.** On `APT/USDC`, a
  size of `10` is 10 APT and a price of `5.2` is 5.2 USDC per APT.
- **A buy escrows `size * price` of the quote asset** at the price submitted.
- **Placement can be asynchronous.** When funding needs a rate-limited
  collateral withdrawal the transaction still succeeds, but the order is queued
  rather than resting and the response carries `pendingCbs: true`. Track the
  returned order ID through `spot order-history` and `spot history`; `spot
orders` only shows gtc/post-only orders once they rest, and an IOC order
  never appears there at all.

### `decibel-cli spot order limit <side> <size> <symbol> <price>`

Place a spot limit order.

**Arguments:**

| Argument   | Description                           |
| ---------- | ------------------------------------- |
| `<side>`   | `buy` or `sell`                       |
| `<size>`   | Order size, in base-asset units       |
| `<symbol>` | Spot market symbol (e.g., `APT/USDC`) |
| `<price>`  | Limit price, in quote-asset units     |

**Options:**

| Option        | Description                                               |
| ------------- | --------------------------------------------------------- |
| `--tif <tif>` | Time in force: `gtc`, `post-only`, `ioc` (default: `gtc`) |
| `--encrypt`   | Submit as an encrypted (mempool-private) transaction      |
| `--json`      | JSON output                                               |

The price is rounded side-safely to the market tick — buys down, sells up — so
the bound you name is never crossed.

**Examples:**

```bash
# Buy 10 APT at 5.20 USDC
decibel-cli spot order limit buy 10 APT/USDC 5.2

# Post-only sell (rejected if it would cross the book)
decibel-cli spot order limit sell 10 APT/USDC 5.5 --tif post-only
```

### `decibel-cli spot order market <side> <size> <symbol>`

Place a spot market order. There is no market order on chain for spot: this
sends an IOC limit priced at the slippage cap off the book mid, falling back to
the asset-context mid and then the last trade. The command fails rather than
guessing when no source has a price.

The book mid requires **both** sides quoted. A one-sided book is ignored: the
lone quote is set by whoever posted it, and honouring it would let that party
name the price a market order pays on a thin book. (The web order form is more
permissive here, because it shows the price before you confirm; a CLI market
order commits in one step.) On a market that is one-sided with no recent trade,
use `spot order limit` with an explicit price and `--tif ioc`.

**Options:**

| Option             | Description                                           |
| ------------------ | ----------------------------------------------------- |
| `--slippage <pct>` | Slippage percentage (default: 1; under 100 for sells) |
| `--encrypt`        | Submit as an encrypted (mempool-private) transaction  |
| `--json`           | JSON output                                           |

A sell slippage of 100% is rejected: it prices the order at zero, which the
contract always refuses.

The response reports both the `referencePrice` used and the tick-aligned
`limitPrice` the order was actually submitted at (buys round down to the tick,
sells round up, so the cap is never crossed). A buy escrows `size * limitPrice`,
so size against that rather than the reference price.

Because the order is IOC it never rests: it will not appear in `spot orders`
regardless of outcome. Use `spot history` for fills and `spot order-history` for
the final state.

**Examples:**

```bash
decibel-cli spot order market buy 10 APT/USDC
decibel-cli spot order market sell 10 APT/USDC --slippage 0.5
```

### `decibel-cli spot cancel <orderId>`

Cancel an open spot order, including one still queued behind a collateral
withdrawal — this is the only command that reaches those.

The market list is consulted only to normalize the symbol's casing, since the
on-chain address is derived from the name. A lookup failure therefore does not
block the cancel: leaving a queued order live because `/markets` was briefly
unavailable would let it execute when the queue drains. When the symbol cannot
be confirmed the CLI says so and uses it as typed, which surfaces a wrong symbol
as an on-chain abort rather than a silent no-op.

**Options:**

| Option              | Description                        |
| ------------------- | ---------------------------------- |
| `--market <symbol>` | Spot market symbol (required)      |
| `--encrypt`         | Submit as an encrypted transaction |
| `--json`            | JSON output                        |

**Example:**

```bash
decibel-cli spot cancel 12345 --market APT/USDC
```

### `decibel-cli spot cancel-all`

Cancel all open spot orders. Perp orders are not touched.

**Options:**

| Option              | Description                            |
| ------------------- | -------------------------------------- |
| `--market <symbol>` | Only cancel orders for one spot market |
| `-y, --yes`         | Skip the confirmation prompt           |
| `--encrypt`         | Submit as an encrypted transaction     |
| `--json`            | JSON output                            |

Cancellation runs in repeated passes. One sweep of `offset` pagination reaches
at most 10,500 orders, so accounts above that are cleared over several passes
rather than partially cleared with a success report.

Orders already cancelled in a run are never re-submitted. The open-orders feed
is served from an indexer that lags the chain, so a window can briefly
republish orders that are already gone; without that guard the failed
re-cancels would look like "nothing left to do" and end the run early. A window
holding nothing but already-cancelled orders is treated as the indexer lagging:
the command backs off and retries, and raises an `Incomplete:` error rather
than reporting a sweep it cannot verify. Re-running resumes safely.

Without `-y`, the market symbol is validated before the prompt, so a typo fails
the same way it does with `-y` rather than reporting an empty book.

`--market` filters client-side, because `/open_orders` takes no market
parameter. On a subaccount with more open orders than pagination exposes, a
window filled with other markets' orders hides the matching ones behind it, and
no number of passes can reach them.

**`cancel-all` does not reach CBS-queued orders.** An order queued behind a
rate-limited collateral withdrawal (a placement that returned `pendingCbs`) is
live from your point of view but is not on the book, so it never appears in the
open-orders feed that this command sweeps — and it will execute once the
withdrawal drains. `spot cancel <orderId> --market <symbol>` _does_ reach a
queued order, so cancel those by id. There is currently no way to enumerate
them from a client.

That case raises an `Unreachable:` error, which is not retryable — re-running
reads the same window. It is usually reached _after_ cancelling the matching
orders that were visible, so the message leads with how many were cancelled;
treat it as partial progress, not a total failure. An unfiltered `cancel-all`
would reach the remainder, but it also cancels orders on every other market.

### `decibel-cli spot orders`

View open spot orders. Only resting orders appear here — an IOC order fills or
cancels on placement and never rests.

`offset` pagination reaches at most 10,500 orders. Beyond that the output
carries `truncated: true` (and prints a warning) so the list is never mistaken
for the complete set.

**Options:**

| Option        | Description             |
| ------------- | ----------------------- |
| `-w, --watch` | Real-time order updates |
| `--json`      | JSON output             |

### `decibel-cli spot balances`

View spot holdings, the amounts reserved by open spot orders, and lifetime spot
volume, fees and realized PnL.

**Output includes:**

- Per-asset amount, USD value, entry notional and unrealized PnL. "Entry
  notional" is the total recorded cost basis of the costed units, not a
  per-unit average — assets that arrived without an on-book fill carry no cost,
  so it cannot be divided by the held amount to get one.
- Total USD value and unrealized PnL across holdings and escrowed base
- Amounts reserved by open orders (USDC for bids, the base asset for asks)
- Lifetime spot volume, fees and realized PnL

Prints "No current spot holdings" for a flat account, then still shows the
lifetime metrics — an account that sold out and withdrew has no holdings but
does have history.

**Options:**

| Option   | Description |
| -------- | ----------- |
| `--json` | JSON output |

### `decibel-cli spot history`

View spot trade (fill) history.

**Options:**

| Option        | Description                            |
| ------------- | -------------------------------------- |
| `--limit <n>` | Number of trades to show (default: 20) |
| `--json`      | JSON output                            |

### `decibel-cli spot order-history`

View spot order history across all order states.

**Options:**

| Option        | Description                            |
| ------------- | -------------------------------------- |
| `--limit <n>` | Number of orders to show (default: 20) |
| `--json`      | JSON output                            |

### `decibel-cli spot markets ls`

List all available spot markets.

**Output includes:**

- Market name
- Tick size, min size and lot size, normalized to order units (quote-asset
  units for the tick, base-asset units for sizes)
- Mode

The `--json` output additionally carries `rawTickSize`, `rawMinSize` and
`rawLotSize` — the on-chain integer forms, which are 6-10 orders of magnitude
larger. Compare an order against the normalized fields, never the raw ones.

### `decibel-cli spot price <symbol>`

Get the current price and 24h stats for a spot market. Spot has no funding rate,
open interest, mark price or oracle price.

Nulls are meaningful and rendered as `n/a`: the mid price is null unless both
sides of the book have resting liquidity, and last price / 24h high / 24h low
are null without a trade in the last 24h.

**Example JSON output:**

```json
{
  "symbol": "APT/USDC",
  "lastPrice": 5.21,
  "midPrice": 5.215,
  "change24hPct": -1.32,
  "high24h": 5.4,
  "low24h": 5.1,
  "volume24hBase": 120000,
  "volume24hQuote": 625000
}
```

### `decibel-cli spot book <symbol>`

View the order book for a spot market.

**Options:**

| Option        | Description                    |
| ------------- | ------------------------------ |
| `--depth <n>` | Number of levels (default: 10) |
| `--json`      | JSON output                    |

---

## Error Handling

Common errors and their meanings:

| Error                       | Cause                            | Solution                                                        |
| --------------------------- | -------------------------------- | --------------------------------------------------------------- |
| `No account configured`     | No account set up                | Run `decibel-cli account add` or set env vars                   |
| `Invalid private key`       | Malformed private key            | Ensure key starts with `0x`                                     |
| `Insufficient balance`      | Not enough funds                 | Deposit USDC via [app.decibel.trade](https://app.decibel.trade) |
| `Invalid market`            | Unknown market symbol            | Check `decibel-cli markets ls`                                  |
| `Spot market ... not found` | Symbol is a perp, or misspelled  | Check `decibel-cli spot markets ls`                             |
| `No price source`           | Spot book empty, no recent trade | Use `spot order limit` with an explicit price                   |
| `Order failed`              | Various reasons                  | Check error message for details                                 |

---

## Exit Codes

| Code | Meaning |
| ---- | ------- |
| 0    | Success |
| 1    | Error   |

---

## Environment Variables

| Variable                      | Description                                                     |
| ----------------------------- | --------------------------------------------------------------- |
| `DECIBEL_PRIVATE_KEY`         | API wallet private key for signing transactions                 |
| `DECIBEL_SUBACCOUNT_ADDRESS`  | Subaccount address for trading                                  |
| `DECIBEL_NETWORK`             | Network: mainnet, testnet, local (default: testnet)             |
| `DECIBEL_NODE_API_KEY`        | Node API key for higher rate limits (from geomi.dev)            |
| `DECIBEL_GAS_STATION_API_KEY` | Gas station API key for sponsored transactions (from geomi.dev) |

---

## Local Storage

| Path                    | Description                            |
| ----------------------- | -------------------------------------- |
| `~/.decibel/data.db`    | SQLite database for account management |
| `~/.decibel/server.pid` | Background server PID file (future)    |
