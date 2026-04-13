# Decibel CLI Reference

Complete command reference for the Decibel CLI.

## Global Options

These options can be used with any command:

| Option              | Description                             |
| ------------------- | --------------------------------------- |
| `--json`            | Output in JSON format for scripting     |
| `--network <name>`  | Network: mainnet, testnet, netna, local |
| `--account <alias>` | Use specific account                    |
| `-V, --version`     | Show version number                     |
| `-h, --help`        | Show help                               |

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
| Option | Description |
|--------|-------------|
| `-y, --yes` | Skip confirmation |

```bash
decibel-cli account remove
decibel-cli account remove main -y
```

### `decibel-cli account info`

Show account balances and equity.

**Options:**
| Option | Description |
|--------|-------------|
| `--json` | JSON output |
| `--account <alias>` | Specific account |
| `--network <name>` | Network to use |

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
| Argument | Description |
|----------|-------------|
| `side` | `buy`, `sell`, `long`, or `short` |
| `size` | Order size |
| `symbol` | Market symbol (e.g., BTC/USD) |
| `price` | Limit price |

**Options:**
| Option | Description |
|--------|-------------|
| `--tif <tif>` | Time-in-force: `gtc` (default), `post-only`, `ioc` |
| `--reduce-only` | Reduce-only order |
| `--client-id <id>` | Client order ID |

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
| Argument | Description |
|----------|-------------|
| `side` | `buy`, `sell`, `long`, or `short` |
| `size` | Order size |
| `symbol` | Market symbol |

**Options:**
| Option | Description |
|--------|-------------|
| `--slippage <pct>` | Slippage percentage (default: 1%) |
| `--reduce-only` | Reduce-only order |

**Examples:**

```bash
decibel-cli trade order market buy 0.01 BTC/USD
decibel-cli trade order market sell 0.1 ETH/USD --slippage 0.5
```

### `decibel-cli trade order stop-limit <side> <size> <symbol> <price> <stopPrice>`

Place a stop limit order. Triggers at stop price, then posts as a limit order.

**Arguments:**
| Argument | Description |
|----------|-------------|
| `side` | `buy`, `sell`, `long`, or `short` |
| `size` | Order size |
| `symbol` | Market symbol |
| `price` | Limit price (execution price after trigger) |
| `stopPrice` | Stop trigger price |

**Options:**
| Option | Description |
|--------|-------------|
| `--tif <tif>` | Time-in-force: `gtc` (default), `post-only`, `ioc` |
| `--reduce-only` | Reduce-only order |
| `--client-id <id>` | Client order ID |

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
| Argument | Description |
|----------|-------------|
| `side` | `buy`, `sell`, `long`, or `short` |
| `size` | Order size |
| `symbol` | Market symbol |
| `stopPrice` | Stop trigger price |

**Options:**
| Option | Description |
|--------|-------------|
| `--slippage <pct>` | Slippage percentage from stop price (default: 1%) |
| `--reduce-only` | Reduce-only order |
| `--client-id <id>` | Client order ID |

**Examples:**

```bash
decibel-cli trade order stop-market sell 0.01 BTC/USD 60000
decibel-cli trade order stop-market sell 0.01 BTC/USD 60000 --reduce-only --slippage 2
```

### `decibel-cli trade order twap <side> <size> <symbol>`

Place a TWAP (Time-Weighted Average Price) order. Splits execution over a duration at regular intervals.

**Arguments:**
| Argument | Description |
|----------|-------------|
| `side` | `buy`, `sell`, `long`, or `short` |
| `size` | Total order size |
| `symbol` | Market symbol |

**Required options:**
| Option | Description |
|--------|-------------|
| `--duration <seconds>` | Total duration (120s–86400s) |
| `--frequency <seconds>` | Execution frequency (min 60s) |

**Options:**
| Option | Description |
|--------|-------------|
| `--reduce-only` | Reduce-only order |
| `--client-id <id>` | Client order ID |

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
| Argument | Description |
|----------|-------------|
| `symbol` | Market symbol |

**Options:**
| Option | Description |
|--------|-------------|
| `--slippage <pct>` | Slippage percentage (default: 1%) |
| `--size <size>` | Partial close size (default: full position) |

**Examples:**

```bash
decibel-cli trade close BTC/USD
decibel-cli trade close ETH/USD --size 0.5
```

### `decibel-cli trade cancel <orderId>`

Cancel an order by ID.

**Required options:**
| Option | Description |
|--------|-------------|
| `--market <symbol>` | Market symbol |

**Example:**

```bash
decibel-cli trade cancel 12345 --market BTC/USD
```

### `decibel-cli trade cancel-twap <orderId>`

Cancel an active TWAP order.

**Required options:**
| Option | Description |
|--------|-------------|
| `--market <symbol>` | Market symbol |

**Example:**

```bash
decibel-cli trade cancel-twap 67890 --market BTC/USD
```

### `decibel-cli trade cancel-all`

Cancel all open orders.

**Options:**
| Option | Description |
|--------|-------------|
| `--market <symbol>` | Only cancel orders for specific market |
| `-y, --yes` | Skip confirmation |

**Examples:**

```bash
decibel-cli trade cancel-all
decibel-cli trade cancel-all --market BTC/USD -y
```

### `decibel-cli trade tp-sl set <symbol>`

Set take-profit and/or stop-loss for a position. Omit size options to apply to the full position.

**Arguments:**
| Argument | Description |
|----------|-------------|
| `symbol` | Market symbol |

**Options:**
| Option | Description |
|--------|-------------|
| `--tp-trigger <price>` | Take-profit trigger price |
| `--tp-limit <price>` | Take-profit limit price |
| `--tp-size <size>` | Take-profit size (omit for full position) |
| `--sl-trigger <price>` | Stop-loss trigger price |
| `--sl-limit <price>` | Stop-loss limit price |
| `--sl-size <size>` | Stop-loss size (omit for full position) |

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
| Option | Description |
|--------|-------------|
| `--market <symbol>` | Market symbol |

**Example:**

```bash
decibel-cli trade tp-sl cancel 12345 --market BTC/USD
```

### `decibel-cli trade set-leverage <symbol> <leverage>`

Set leverage for a market.

**Arguments:**
| Argument | Description |
|----------|-------------|
| `symbol` | Market symbol |
| `leverage` | Leverage value (1-50 depending on market) |

**Options:**
| Option | Description |
|--------|-------------|
| `--cross` | Use cross margin (default) |
| `--isolated` | Use isolated margin |

**Examples:**

```bash
decibel-cli trade set-leverage BTC/USD 10
decibel-cli trade set-leverage ETH/USD 5 --isolated
```

### `decibel-cli trade set-margin <symbol> <type>`

Switch margin type for a market. Preserves current leverage setting.

**Arguments:**
| Argument | Description |
|----------|-------------|
| `symbol` | Market symbol |
| `type` | `cross` or `isolated` |

**Examples:**

```bash
decibel-cli trade set-margin BTC/USD isolated
decibel-cli trade set-margin ETH/USD cross
```

### `decibel-cli trade positions`

View open positions.

**Options:**
| Option | Description |
|--------|-------------|
| `-w, --watch` | Real-time updates |
| `--json` | JSON output |

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
| Option | Description |
|--------|-------------|
| `-w, --watch` | Real-time updates |
| `--json` | JSON output |

**Examples:**

```bash
decibel-cli trade orders
decibel-cli trade orders -w
```

### `decibel-cli trade history`

View trade history.

**Options:**
| Option | Description |
|--------|-------------|
| `--limit <n>` | Number of trades to show (default: 20) |
| `--json` | JSON output |

### `decibel-cli trade order-history`

View order history (all order states including filled, cancelled, etc.).

**Options:**
| Option | Description |
|--------|-------------|
| `--limit <n>` | Number of orders to show (default: 20) |
| `--json` | JSON output |

### `decibel-cli trade active-twaps`

View active TWAP orders.

### `decibel-cli trade twap-history`

View TWAP order history (completed and cancelled).

**Options:**
| Option | Description |
|--------|-------------|
| `--limit <n>` | Number of TWAP orders to show (default: 20) |
| `--json` | JSON output |

### `decibel-cli trade funding-history`

View funding rate payment history.

**Options:**
| Option | Description |
|--------|-------------|
| `--limit <n>` | Number of records to show (default: 20) |
| `--json` | JSON output |

---

## Market Information

### `decibel-cli markets ls`

List all available markets.

**Output includes:**

- Market name
- Max leverage
- Tick size
- Min size
- Mode (Open, ReduceOnly, etc.)

**Examples:**

```bash
decibel-cli markets ls
decibel-cli markets ls --json
```

### `decibel-cli markets price <symbol>`

Get current price for a market.

**Options:**
| Option | Description |
|--------|-------------|
| `-w, --watch` | Real-time price updates |
| `--json` | JSON output |

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
| Option | Description |
|--------|-------------|
| `-w, --watch` | Real-time order book updates |
| `--depth <n>` | Number of levels (default: 10) |
| `--json` | JSON output |

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

## Error Handling

Common errors and their meanings:

| Error                   | Cause                 | Solution                                                        |
| ----------------------- | --------------------- | --------------------------------------------------------------- |
| `No account configured` | No account set up     | Run `decibel-cli account add` or set env vars                   |
| `Invalid private key`   | Malformed private key | Ensure key starts with `0x`                                     |
| `Insufficient balance`  | Not enough funds      | Deposit USDC via [app.decibel.trade](https://app.decibel.trade) |
| `Invalid market`        | Unknown market symbol | Check `decibel-cli markets ls`                                  |
| `Order failed`          | Various reasons       | Check error message for details                                 |

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
| `DECIBEL_ACCOUNT_ALIAS`       | Account alias from stored accounts                              |
| `DECIBEL_NETWORK`             | Network: mainnet, testnet, netna, local (default: testnet)      |
| `DECIBEL_NODE_API_KEY`        | Node API key for higher rate limits (from geomi.dev)            |
| `DECIBEL_GAS_STATION_API_KEY` | Gas station API key for sponsored transactions (from geomi.dev) |

---

## Local Storage

| Path                    | Description                            |
| ----------------------- | -------------------------------------- |
| `~/.decibel/data.db`    | SQLite database for account management |
| `~/.decibel/server.pid` | Background server PID file (future)    |
