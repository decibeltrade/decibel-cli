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
      "args": ["tsx", "src/mcp-server.ts"],
      "cwd": "/path/to/decibel-cli",
      "env": {
        "DECIBEL_PRIVATE_KEY": "0x...",
        "DECIBEL_NETWORK": "testnet"
      }
    }
  }
}
```

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `place_limit_order` | Place a limit order |
| `place_market_order` | Place a market order |
| `cancel_order` | Cancel a specific order |
| `set_leverage` | Set leverage for a market |
| `get_positions` | Get open positions |
| `get_orders` | Get open orders |
| `get_markets` | List all markets |
| `get_price` | Get current price |
| `get_orderbook` | Get order book |
| `get_balances` | Get account balances |
| `deposit` | Deposit USDC |
| `withdraw` | Withdraw USDC |

---

## 2. Account Setup

### List Accounts

```bash
decibel-cli account ls
```

**Output:**
```
┌───────┬────────────────────┬─────────┐
│ Name  │ Address            │ Default │
├───────┼────────────────────┼─────────┤
│ main  │ 0x7c9dd8...31dfe9  │ ✓       │
└───────┴────────────────────┴─────────┘
```

### Check Balances

```bash
decibel-cli funds balances
```

**Output:**
```
┌─────────────────────────┬──────────┐
│ Balance Type            │ Amount   │
├─────────────────────────┼──────────┤
│ Wallet USDC             │ $0.00    │
├─────────────────────────┼──────────┤
│ Account Value           │ $999.97  │
├─────────────────────────┼──────────┤
│ Unrealized PnL          │ $0.00    │
├─────────────────────────┼──────────┤
│ Withdrawable (Cross)    │ $982.67  │
├─────────────────────────┼──────────┤
│ Withdrawable (Isolated) │ $0.00    │
└─────────────────────────┴──────────┘
```

---

## 3. Market Data

### List All Markets

```bash
decibel-cli markets ls
```

**Output:**
```
┌─────────┬─────────────┬───────────┬─────────────┐
│ Symbol  │ Max Leverage│ Tick Size │ Min Size    │
├─────────┼─────────────┼───────────┼─────────────┤
│ BTC/USD │ 40x         │ 0.01      │ 0.0001      │
├─────────┼─────────────┼───────────┼─────────────┤
│ ETH/USD │ 20x         │ 0.01      │ 0.001       │
├─────────┼─────────────┼───────────┼─────────────┤
│ SOL/USD │ 20x         │ 0.001     │ 0.01        │
├─────────┼─────────────┼───────────┼─────────────┤
│ APT/USD │ 20x         │ 0.0001    │ 0.1         │
├─────────┼─────────────┼───────────┼─────────────┤
│ ...     │ ...         │ ...       │ ...         │
└─────────┴─────────────┴───────────┴─────────────┘
```

### Get Price

```bash
decibel-cli markets price ETH/USD
```

**Output:**
```
┌─────────┬───────────┬───────────┬───────────┬────────────┐
│ Market  │ Mark      │ Index     │ Bid       │ Ask        │
├─────────┼───────────┼───────────┼───────────┼────────────┤
│ ETH/USD │ $2320.65  │ $2320.50  │ $2320.40  │ $2320.90   │
└─────────┴───────────┴───────────┴───────────┴────────────┘
```

### View Order Book (with Depth Visualization)

```bash
decibel-cli markets book ETH/USD
```

**Output:**
```
ETH/USD Order Book

  Price          Size         Depth
  ─────────────────────────────────────────────────────
       2322.20    411.0535  ████████████████████
       2321.97    369.9851  ██████████████████░░
       2321.73    328.9085  ████████████████░░░░
       2321.50    287.8237  ██████████████░░░░░░
       2321.27    246.7307  ████████████░░░░░░░░
       2321.04    205.6295  ██████████░░░░░░░░░░
       2320.81    164.5200  ████████░░░░░░░░░░░░
       2320.57    123.4023  ██████░░░░░░░░░░░░░░
       2320.34     82.2765  ████░░░░░░░░░░░░░░░░
       2320.11     41.1423  ██░░░░░░░░░░░░░░░░░░
  ─── Spread: $0.47 (0.020%) ───
       2319.64     41.1506  ░░░░░░░░░░░░░░░░░░██
       2319.40     82.3094  ░░░░░░░░░░░░░░░░████
       2319.17    123.4764  ░░░░░░░░░░░░░░██████
       2318.94    164.6517  ░░░░░░░░░░░░████████
       2318.71    205.8352  ░░░░░░░░░░██████████
       2318.48    247.0270  ░░░░░░░░████████████
       2318.24    288.2270  ░░░░░░██████████████
       2318.01    329.4352  ░░░░████████████████
       2317.78    370.6517  ░░██████████████████
       2317.55    411.8764  ████████████████████
```

*Red prices = asks (sell orders), Green prices = bids (buy orders)*

---

## 4. Trading Flow

### Step 1: Place a Limit Order

```bash
decibel-cli trade order limit long 0.1 ETH/USD 2300
```

**Output:**
```
✓ Order placed successfully
Order ID: N/A
Transaction: 0x171a54367b62262bfc2d33c4306787e32a657712b6e963fd0c29b7ca6e698c5b
```

### Step 2: View Open Orders

```bash
decibel-cli trade orders
```

**Output:**
```
┌───────────────┬───────────────────┬──────┬────────┬──────────┬────────┬───────┬────────┐
│ ID            │ Market            │ Side │ Size   │ Price    │ Filled │ Type  │ Status │
├───────────────┼───────────────────┼──────┼────────┼──────────┼────────┼───────┼────────┤
│ 170141...2544 │ 0x3f20be...81d0bd │ BUY  │ 0.1000 │ $2300.00 │ 0.0000 │ Limit │        │
└───────────────┴───────────────────┴──────┴────────┴──────────┴────────┴───────┴────────┘
```

### Step 3: Place a Market Order (Immediate Fill)

```bash
decibel-cli trade order market long 0.05 ETH/USD
```

**Output:**
```
✓ Market order placed successfully
Order ID: N/A
Transaction: 0x319c833d795e5385b3a6ccf05114b7294eb8a8d92b460cc33ac8b05fbae260fc
```

### Step 4: View Positions

```bash
decibel-cli trade positions
```

**Output:**
```
┌────────┬──────┬────────┬──────────┬───────┬──────┬──────────┬───────────┐
│ Market │ Side │ Size   │ Entry    │ Mark  │ uPnL │ Leverage │ Liq Price │
├────────┼──────┼────────┼──────────┼───────┼──────┼──────────┼───────────┤
│        │ LONG │ 0.0500 │ $2319.76 │ $0.00 │ 0.00 │ -x       │ -         │
└────────┴──────┴────────┴──────────┴───────┴──────┴──────────┴───────────┘
```

### Step 5: Close Position

```bash
decibel-cli trade order market short 0.05 ETH/USD
```

**Output:**
```
✓ Market order placed successfully
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
┌──────────────────────┬───────────────────┬───────────┬────────┬───────────┬────────┬───────┐
│ Time                 │ Market            │ Action    │ Size   │ Price     │ Fee    │ PnL   │
├──────────────────────┼───────────────────┼───────────┼────────┼───────────┼────────┼───────┤
│ 2/3/2026, 2:31:27 AM │ 0x3f20be...81d0bd │ CloseLong │ 0.0500 │ $2321.06  │ 0.0394 │ +0.06 │
├──────────────────────┼───────────────────┼───────────┼────────┼───────────┼────────┼───────┤
│ 2/3/2026, 2:30:34 AM │ 0x3f20be...81d0bd │ OpenLong  │ 0.0500 │ $2319.76  │ 0.0394 │ 0.00  │
├──────────────────────┼───────────────────┼───────────┼────────┼───────────┼────────┼───────┤
│ 2/3/2026, 2:21:07 AM │ 0x274b5e...6d6557 │ CloseLong │ 0.0010 │ $78652.10 │ 0.0267 │ +0.02 │
├──────────────────────┼───────────────────┼───────────┼────────┼───────────┼────────┼───────┤
│ 2/3/2026, 2:20:45 AM │ 0x274b5e...6d6557 │ OpenLong  │ 0.0010 │ $78633.60 │ 0.0267 │ 0.00  │
└──────────────────────┴───────────────────┴───────────┴────────┴───────────┴────────┴───────┘
```

**Result:** Opened long 0.05 ETH at $2,319.76, closed at $2,321.06 for **+$0.06 profit**

### Step 8: Cancel Resting Orders

```bash
decibel-cli trade cancel-all --yes
```

**Output:**
```
✓ Cancelled 1 order(s)
```

---

## 5. Funds Management

### Get Testnet USDC (Faucet)

```bash
decibel-cli funds faucet --amount 1000
```

**Output:**
```
✓ Successfully minted 1000 USDC
Transaction: 0x...
```

*Note: Max $1000/day per account. Uses gasless transactions (no APT needed).*

### Deposit to Trading Account

```bash
decibel-cli funds deposit 100
```

### Withdraw from Trading Account

```bash
decibel-cli funds withdraw 50
```

### View Fund History

```bash
decibel-cli funds history
```

---

## 6. Command Reference

### Global Options

| Option | Description |
|--------|-------------|
| `--network <network>` | Network: testnet, netna, local (default: testnet) |
| `--json` | Output in JSON format (for scripting/AI agents) |
| `-h, --help` | Show help |
| `-V, --version` | Show version |

### Account Commands

| Command | Description |
|---------|-------------|
| `account add` | Add a new account (interactive) |
| `account ls` | List all accounts |
| `account remove <name>` | Remove an account |
| `account set-default <name>` | Set default account |

### Trade Commands

| Command | Description |
|---------|-------------|
| `trade order limit <side> <size> <symbol> <price>` | Place limit order |
| `trade order market <side> <size> <symbol>` | Place market order |
| `trade cancel <orderId>` | Cancel specific order |
| `trade cancel-all` | Cancel all orders |
| `trade set-leverage <symbol> <leverage>` | Set leverage |
| `trade positions` | View open positions |
| `trade orders` | View open orders |
| `trade history` | View trade history |

*Side options: `long`, `short`, `buy`, `sell`*

### Market Commands

| Command | Description |
|---------|-------------|
| `markets ls` | List all markets |
| `markets price <symbol>` | Get current price |
| `markets book <symbol>` | View order book with depth |

### Funds Commands

| Command | Description |
|---------|-------------|
| `funds balances` | View account balances |
| `funds deposit <amount>` | Deposit USDC |
| `funds withdraw <amount>` | Withdraw USDC |
| `funds faucet` | Mint testnet USDC |
| `funds history` | View fund history |

---

## 7. Key Features

- **Visual Tables** - Color-coded tables for positions, orders, balances
- **Orderbook Depth Bars** - ASCII visualization of market depth
- **Gasless Transactions** - No APT needed (uses Decibel fee payer)
- **MCP Integration** - 12 tools for AI agent integration
- **Multi-Account Support** - Store and switch between accounts
- **JSON Output** - `--json` flag for programmatic access
