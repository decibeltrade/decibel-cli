# Decibel CLI Demo

A complete walkthrough of the Decibel CLI for trading perpetuals on Aptos.

---

## 1. MCP Setup (for AI Agents)

Add this to your Claude Desktop or MCP client configuration:

```json
{
  "mcpServers": {
    "decibel": {
      "command": "npx",
      "args": ["-y", "-p", "@decibeltrade/cli", "decibel-mcp"],
      "env": {
        "DECIBEL_PRIVATE_KEY": "ed25519-priv-0x...",
        "DECIBEL_SUBACCOUNT_ADDRESS": "0x...",
        "DECIBEL_NETWORK": "testnet",
        "DECIBEL_NODE_API_KEY": "your-node-api-key"
      }
    }
  }
}
```

### Available MCP Tools

| Tool                      | Description                      |
| ------------------------- | -------------------------------- |
| `place_limit_order`       | Place a limit order              |
| `place_market_order`      | Place a market order             |
| `place_stop_limit_order`  | Place a stop limit order         |
| `place_stop_market_order` | Place a stop market order        |
| `place_twap_order`        | Place a TWAP order               |
| `close_position`          | Close an open position           |
| `cancel_order`            | Cancel a specific order          |
| `cancel_all_orders`       | Cancel all open orders           |
| `cancel_twap_order`       | Cancel a TWAP order              |
| `place_tp_sl`             | Set TP/SL for a position         |
| `cancel_tp_sl`            | Cancel a TP/SL order             |
| `get_tp_sl`               | Get TP/SL orders for a position  |
| `set_leverage`            | Set leverage for a market        |
| `set_margin_type`         | Switch cross/isolated margin     |
| `get_positions`           | Get open positions               |
| `get_orders`              | Get open orders                  |
| `get_active_twaps`        | Get active TWAP orders           |
| `get_markets`             | List all markets                 |
| `get_price`               | Get current price                |
| `get_orderbook`           | Get order book snapshot          |
| `get_balances`            | Get account balances             |
| `get_trade_history`       | Get trade fill history           |
| `get_order_history`       | Get order history                |
| `get_twap_history`        | Get TWAP order history           |
| `get_funding_history`     | Get funding rate payment history |

---

## 2. Account Setup

### Create an API Wallet

1. Visit [app.decibel.trade/api](https://app.decibel.trade/api)
2. Connect your wallet and create a subaccount (or use an existing one)
3. Create an API wallet for your subaccount
4. Copy the API wallet private key and subaccount address

### Add Account to CLI

```bash
decibel-cli account add
```

Follow the interactive prompts to enter your subaccount address, API wallet private key, and set an alias.

### List Accounts

```bash
decibel-cli account ls
```

**Output:**

```
+-------+--------------------+-----------+---------+
| Name  | Address            | Type      | Default |
+-------+--------------------+-----------+---------+
| main  | 0x7c9dd8...31dfe9  | api-wallet| *       |
+-------+--------------------+-----------+---------+
```

### Check Account Info

```bash
decibel-cli account info
```

**Output:**

```
+-------------------------+----------+
| Property                | Value    |
+-------------------------+----------+
| Subaccount Address      | 0x7c9d.. |
| Account Value           | $999.97  |
| Unrealized PnL          | $0.00    |
| Withdrawable (Cross)    | $982.67  |
+-------------------------+----------+
```

---

## 3. Market Data

### List All Markets

```bash
decibel-cli markets ls
```

**Output:**

```
+---------+-------------+-----------+-------------+
| Symbol  | Max Leverage| Tick Size | Min Size    |
+---------+-------------+-----------+-------------+
| BTC/USD | 40x         | 0.01      | 0.0001      |
| ETH/USD | 20x         | 0.01      | 0.001       |
| SOL/USD | 20x         | 0.001     | 0.01        |
| APT/USD | 20x         | 0.0001    | 0.1         |
| ...     | ...         | ...       | ...         |
+---------+-------------+-----------+-------------+
```

### Get Price

```bash
decibel-cli markets price ETH/USD
```

**Output:**

```
+---------+-----------+-----------+-----------+------------+
| Market  | Mark      | Index     | Bid       | Ask        |
+---------+-----------+-----------+-----------+------------+
| ETH/USD | $2320.65  | $2320.50  | $2320.40  | $2320.90   |
+---------+-----------+-----------+-----------+------------+
```

### View Order Book (with Depth Visualization)

```bash
decibel-cli markets book ETH/USD
```

**Output:**

```
ETH/USD Order Book

  Price          Size         Depth
  ---------------------------------------------------
       2322.20    411.0535  XXXXXXXXXXXXXXXXXXXX
       2321.97    369.9851  XXXXXXXXXXXXXXXXXX..
       2321.73    328.9085  XXXXXXXXXXXXXXXX....
       2321.50    287.8237  XXXXXXXXXXXXXX......
       2321.27    246.7307  XXXXXXXXXXXX........
       2321.04    205.6295  XXXXXXXXXX..........
       2320.81    164.5200  XXXXXXXX............
       2320.57    123.4023  XXXXXX..............
       2320.34     82.2765  XXXX................
       2320.11     41.1423  XX..................
  --- Spread: $0.47 (0.020%) ---
       2319.64     41.1506  ..................XX
       2319.40     82.3094  ................XXXX
       2319.17    123.4764  ..............XXXXXX
       2318.94    164.6517  ............XXXXXXXX
       2318.71    205.8352  ..........XXXXXXXXXX
       2318.48    247.0270  ........XXXXXXXXXXXX
       2318.24    288.2270  ......XXXXXXXXXXXXXX
       2318.01    329.4352  ....XXXXXXXXXXXXXXXX
       2317.78    370.6517  ..XXXXXXXXXXXXXXXXXX
       2317.55    411.8764  XXXXXXXXXXXXXXXXXXXX
```

_Red prices = asks (sell orders), Green prices = bids (buy orders)_

---

## 4. Trading Flow

### Step 1: Place a Limit Order

```bash
decibel-cli trade order limit long 0.1 ETH/USD 2300
```

**Output:**

```
> Order placed successfully
Order ID: N/A
Transaction: 0x171a54367b62262bfc2d33c4306787e32a657712b6e963fd0c29b7ca6e698c5b
```

### Step 2: View Open Orders

```bash
decibel-cli trade orders
```

**Output:**

```
+---------------+-------------------+------+--------+----------+--------+-------+--------+
| ID            | Market            | Side | Size   | Price    | Filled | Type  | Status |
+---------------+-------------------+------+--------+----------+--------+-------+--------+
| 170141...2544 | 0x3f20be...81d0bd | BUY  | 0.1000 | $2300.00 | 0.0000 | Limit |        |
+---------------+-------------------+------+--------+----------+--------+-------+--------+
```

### Step 3: Place a Market Order (Immediate Fill)

```bash
decibel-cli trade order market long 0.05 ETH/USD
```

**Output:**

```
> Market order placed successfully
Order ID: N/A
Transaction: 0x319c833d795e5385b3a6ccf05114b7294eb8a8d92b460cc33ac8b05fbae260fc
```

### Step 4: View Positions

```bash
decibel-cli trade positions
```

**Output:**

```
+--------+------+--------+----------+-------+------+----------+-----------+
| Market | Side | Size   | Entry    | Mark  | uPnL | Leverage | Liq Price |
+--------+------+--------+----------+-------+------+----------+-----------+
|        | LONG | 0.0500 | $2319.76 | $0.00 | 0.00 | -x       | -         |
+--------+------+--------+----------+-------+------+----------+-----------+
```

### Step 5: Close Position

```bash
decibel-cli trade order market short 0.05 ETH/USD
```

**Output:**

```
> Market order placed successfully
Order ID: N/A
Transaction: 0xa0880133c62c7287ccdbcec7bacc5f2b0ec0da005a2f03238126c9d22d8dd711
```

### Step 6: Verify Position Closed

```bash
decibel-cli trade positions
```

**Output:**

```
No open positions
```

### Step 7: View Trade History

```bash
decibel-cli trade history
```

**Output:**

```
+----------------------+-------------------+-----------+--------+-----------+--------+-------+
| Time                 | Market            | Action    | Size   | Price     | Fee    | PnL   |
+----------------------+-------------------+-----------+--------+-----------+--------+-------+
| 2/3/2026, 2:31:27 AM | 0x3f20be...81d0bd | CloseLong | 0.0500 | $2321.06  | 0.0394 | +0.06 |
| 2/3/2026, 2:30:34 AM | 0x3f20be...81d0bd | OpenLong  | 0.0500 | $2319.76  | 0.0394 | 0.00  |
| 2/3/2026, 2:21:07 AM | 0x274b5e...6d6557 | CloseLong | 0.0010 | $78652.10 | 0.0267 | +0.02 |
| 2/3/2026, 2:20:45 AM | 0x274b5e...6d6557 | OpenLong  | 0.0010 | $78633.60 | 0.0267 | 0.00  |
+----------------------+-------------------+-----------+--------+-----------+--------+-------+
```

**Result:** Opened long 0.05 ETH at $2,319.76, closed at $2,321.06 for **+$0.06 profit**

### Step 8: Cancel Resting Orders

```bash
decibel-cli trade cancel-all --yes
```

**Output:**

```
> Cancelled 1 order(s)
```

---

## 5. Command Reference

### Global Options

| Option                | Description                                                |
| --------------------- | ---------------------------------------------------------- |
| `--network <network>` | Network: mainnet, testnet, netna, local (default: testnet) |
| `--json`              | Output in JSON format (for scripting/AI agents)            |
| `-h, --help`          | Show help                                                  |
| `-V, --version`       | Show version                                               |

### Account Commands

| Command                      | Description                      |
| ---------------------------- | -------------------------------- |
| `account add`                | Add a new account (interactive)  |
| `account ls`                 | List all accounts                |
| `account remove <name>`      | Remove an account                |
| `account set-default <name>` | Set default account              |
| `account info`               | Show account balances and equity |

### Trade Commands

| Command                                                             | Description                  |
| ------------------------------------------------------------------- | ---------------------------- |
| `trade order limit <side> <size> <symbol> <price>`                  | Place limit order            |
| `trade order market <side> <size> <symbol>`                         | Place market order           |
| `trade order stop-limit <side> <size> <symbol> <price> <stopPrice>` | Place stop limit order       |
| `trade order stop-market <side> <size> <symbol> <stopPrice>`        | Place stop market order      |
| `trade order twap <side> <size> <symbol> --duration <s> --freq <s>` | Place TWAP order             |
| `trade close <symbol>`                                              | Close position               |
| `trade cancel <orderId>`                                            | Cancel specific order        |
| `trade cancel-twap <orderId>`                                       | Cancel TWAP order            |
| `trade cancel-all`                                                  | Cancel all orders            |
| `trade tp-sl set <symbol>`                                          | Set TP/SL for position       |
| `trade tp-sl ls <symbol>`                                           | List TP/SL for position      |
| `trade tp-sl cancel <orderId>`                                      | Cancel TP/SL order           |
| `trade set-leverage <symbol> <leverage>`                            | Set leverage                 |
| `trade set-margin <symbol> <type>`                                  | Switch cross/isolated margin |
| `trade positions`                                                   | View open positions          |
| `trade orders`                                                      | View open orders             |
| `trade active-twaps`                                                | View active TWAP orders      |
| `trade history`                                                     | View trade fill history      |
| `trade order-history`                                               | View order history           |
| `trade twap-history`                                                | View TWAP history            |
| `trade funding-history`                                             | View funding history         |

_Side options: `long`, `short`, `buy`, `sell`_

### Market Commands

| Command                  | Description                |
| ------------------------ | -------------------------- |
| `markets ls`             | List all markets           |
| `markets price <symbol>` | Get current price          |
| `markets book <symbol>`  | View order book with depth |

---

## 6. Key Features

- **Visual Tables** - Color-coded tables for positions, orders, balances
- **Orderbook Depth Bars** - ASCII visualization of market depth
- **API Wallet Support** - Trade on behalf of subaccounts without deposit/withdraw risk
- **MCP Integration** - 25 tools for AI agent integration
- **Multi-Account Support** - Store and switch between accounts
- **JSON Output** - `--json` flag for programmatic access
