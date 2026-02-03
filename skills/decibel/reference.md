# Decibel CLI Reference

Complete command reference for the Decibel CLI.

## Global Options

These options can be used with any command:

| Option              | Description                         |
| ------------------- | ----------------------------------- |
| `--json`            | Output in JSON format for scripting |
| `--network <name>`  | Network: testnet, netna, local      |
| `--account <alias>` | Use specific account                |
| `-V, --version`     | Show version number                 |
| `-h, --help`        | Show help                           |

---

## Account Management

Commands for managing trading accounts stored locally in `~/.decibel/data.db`.

### `decibel-cli account add`

Interactive wizard to add a new account.

**Process:**

1. Choose account type (API wallet for trading, read-only for monitoring)
2. Enter private key (for API wallet) or address (for read-only)
3. Set an alias for easy identification
4. Optionally set as default account

**Example:**

```bash
decibel-cli account add
# Follow interactive prompts
```

### `decibel-cli account ls`

List all configured accounts.

**Output columns:**

- Alias
- Address (truncated)
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
| `symbol` | Market symbol (e.g., BTC-PERP) |
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
decibel-cli trade order limit buy 0.01 BTC-PERP 50000

# Post-only sell order
decibel-cli trade order limit sell 0.05 ETH-PERP 3500 --tif post-only

# Reduce-only order
decibel-cli trade order limit sell 0.01 BTC-PERP 55000 --reduce-only
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
decibel-cli trade order market buy 0.01 BTC-PERP
decibel-cli trade order market sell 0.1 ETH-PERP --slippage 0.5
```

### `decibel-cli trade cancel <orderId>`

Cancel an order by ID.

**Required options:**
| Option | Description |
|--------|-------------|
| `--market <symbol>` | Market symbol |

**Example:**

```bash
decibel-cli trade cancel 12345 --market BTC-PERP
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
decibel-cli trade cancel-all --market BTC-PERP -y
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
decibel-cli trade set-leverage BTC-PERP 10
decibel-cli trade set-leverage ETH-PERP 5 --isolated
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
decibel-cli markets price BTC-PERP
decibel-cli markets price ETH-PERP -w
```

**JSON output:**

```json
{
  "symbol": "BTC-PERP",
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
decibel-cli markets book BTC-PERP
decibel-cli markets book ETH-PERP -w --depth 20
```

---

## Fund Management

### `decibel-cli funds deposit <amount>`

Deposit USDC from wallet to trading account.

**Example:**

```bash
decibel-cli funds deposit 100
```

### `decibel-cli funds withdraw <amount>`

Withdraw USDC from trading account to wallet.

**Example:**

```bash
decibel-cli funds withdraw 50
```

### `decibel-cli funds balances`

View wallet and trading account balances.

**Output includes:**

- Wallet USDC balance
- Account balance (deposited)
- Account value (including unrealized PnL)
- Available balance
- Unrealized PnL

### `decibel-cli funds history`

View deposit and withdrawal history.

**Options:**
| Option | Description |
|--------|-------------|
| `--limit <n>` | Number of records (default: 20) |
| `--json` | JSON output |

---

## Error Handling

Common errors and their meanings:

| Error                    | Cause                 | Solution                                |
| ------------------------ | --------------------- | --------------------------------------- |
| `No account configured`  | No account set up     | Run `decibel-cli account add`           |
| `Invalid private key`    | Malformed private key | Ensure key starts with `0x`             |
| `Insufficient balance`   | Not enough funds      | Deposit with `decibel-cli funds deposit` |
| `Invalid market`         | Unknown market symbol | Check `decibel-cli markets ls`          |
| `Order failed`           | Various reasons       | Check error message for details         |

---

## Exit Codes

| Code | Meaning       |
| ---- | ------------- |
| 0    | Success       |
| 1    | Error         |

---

## Environment Variables

| Variable                  | Description                                                |
| ------------------------- | ---------------------------------------------------------- |
| `DECIBEL_PRIVATE_KEY`     | Private key for trading (required if not using account db) |
| `DECIBEL_NETWORK`         | Network: testnet, netna, local (default: testnet)          |
| `DECIBEL_NODE_API_KEY`    | Node API key for higher rate limits                        |
| `DECIBEL_GAS_STATION_API_KEY` | Gas station API key for sponsored transactions         |

---

## Local Storage

| Path                      | Description                                  |
| ------------------------- | -------------------------------------------- |
| `~/.decibel/data.db`      | SQLite database for account management       |
| `~/.decibel/server.pid`   | Background server PID file (future)          |
