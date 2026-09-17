# Decibel CLI

Command-line interface and MCP server for trading on [Decibel DEX](https://decibel.trade) - a perpetual futures and spot exchange built on Aptos blockchain.

Includes a built-in [MCP server](#mcp-server-ai-agent-integration) with 36 tools, enabling AI agents like Claude to trade perps and spot, monitor positions, and manage accounts through natural language.

**Target users:** AI agents (primary) and human power users (secondary)

## Features

- **Full Order Types** - Limit, market, stop-limit, stop-market, and TWAP orders
- **Spot Trading** - Limit and market orders, holdings, and spot market data
- **TP/SL Management** - Set, list, and cancel take-profit/stop-loss orders
- **Account Management** - Multi-account support with encrypted local storage
- **Market Data** - Real-time prices, orderbook with depth visualization
- **Watch Mode** - WebSocket-powered real-time updates
- **MCP Server** - 36 tools for AI agent integration via Model Context Protocol
- **JSON Output** - `--json` flag on all commands for machine-readable output

## Installation

```bash
npm install -g decibel-cli
```

## Quick Start

```bash
# Set required environment variables
export DECIBEL_NODE_API_KEY=aptoslabs_...        # Node API key (from geomi.dev)
export DECIBEL_NETWORK=testnet                   # Network (mainnet, testnet, local)

# Add your trading account
decibel-cli account add

# List available markets
decibel-cli markets ls

# Check BTC price
decibel-cli markets price BTC/USD

# Place a limit order
decibel-cli trade order limit buy 0.01 BTC/USD 50000

# View positions
decibel-cli trade positions

# Place a spot order
decibel-cli spot order limit buy 10 APT/USDC 5.2
```

## Authentication

The CLI uses **API wallets** for signing transactions on behalf of your Decibel subaccount. API wallets can be created at [app.decibel.trade/api](https://app.decibel.trade/api). They allow programmatic trading without permitting deposits or withdrawals.

The CLI supports multiple authentication methods (in priority order):

1. `--account <alias>` flag - Use a named account from local storage
2. `DECIBEL_PRIVATE_KEY` environment variable - API wallet private key
3. `DECIBEL_SUBACCOUNT_ADDRESS` environment variable - Subaccount address (read-only operations)
4. Default account from SQLite database (`~/.decibel/data.db`)

### Adding an Account

```bash
decibel-cli account add
# Follow interactive prompts to:
# - Choose type (api-wallet or read-only)
# - Enter your subaccount address
# - Enter API wallet private key (for api-wallet type)
# - Set an alias
# - Optionally set as default
```

## Commands

### Account

```bash
decibel-cli account add              # Add new account
decibel-cli account ls               # List accounts
decibel-cli account set-default      # Change default
decibel-cli account remove           # Remove account
decibel-cli account info             # Show balances
```

### Trading

```bash
# Orders
decibel-cli trade order limit <side> <size> <symbol> <price>
decibel-cli trade order market <side> <size> <symbol>
decibel-cli trade order stop-limit <side> <size> <symbol> <price> <stopPrice>
decibel-cli trade order stop-market <side> <size> <symbol> <stopPrice>
decibel-cli trade order twap <side> <size> <symbol> --duration <s> --frequency <s>

# Cancel
decibel-cli trade cancel <orderId> --market <symbol>
decibel-cli trade cancel-all
decibel-cli trade cancel-twap <orderId> --market <symbol>

# Close positions
decibel-cli trade close <symbol>

# TP/SL
decibel-cli trade tp-sl set <symbol> --tp-trigger <price> --sl-trigger <price>
decibel-cli trade tp-sl ls <symbol>
decibel-cli trade tp-sl cancel <orderId> --market <symbol>

# Configuration
decibel-cli trade set-leverage <symbol> <leverage>
decibel-cli trade set-margin <symbol> <cross|isolated>

# View data
decibel-cli trade positions [-w]
decibel-cli trade orders [-w]
decibel-cli trade active-twaps
decibel-cli trade history
decibel-cli trade order-history
decibel-cli trade twap-history
decibel-cli trade funding-history
```

### Spot

Spot and perps are separate products: a symbol belongs to one or the other, and
`trade` commands will not find a spot market (nor `spot` a perp one). Spot
orders have no leverage, positions, reduce-only, TP/SL, TWAP or client order id.

```bash
# Orders
decibel-cli spot order limit <side> <size> <symbol> <price> [--tif gtc|post-only|ioc]
decibel-cli spot order market <side> <size> <symbol> [--slippage <pct>]

# Cancel
decibel-cli spot cancel <orderId> --market <symbol>
decibel-cli spot cancel-all [--market <symbol>]

# View data
decibel-cli spot orders [-w]
decibel-cli spot balances
decibel-cli spot history
decibel-cli spot order-history

# Market data
decibel-cli spot markets ls
decibel-cli spot price <symbol>
decibel-cli spot book <symbol>
```

Sizes are in base-asset units and prices in quote-asset units, and
`spot markets ls` reports tick/min/lot size in those same units (the `--json`
output also carries the raw chain-unit values as `rawTickSize`, `rawMinSize`
and `rawLotSize`). There is no market order on chain for spot: `spot order
market` sends an IOC limit priced at the slippage cap off the book mid
(falling back to the last trade), reports the tick-aligned price it was
actually submitted at, and a buy reserves `size * that price` of the quote
asset.

`spot cancel-all` sweeps the open-orders feed, which does not include orders
queued behind a collateral withdrawal — those execute when the withdrawal
drains. Cancel a queued order by id with `spot cancel <orderId> --market <symbol>`.

Spot placement is asynchronous when funding needs a rate-limited collateral
withdrawal. The transaction still succeeds, but the response carries
`pendingCbs: true` and the order is queued rather than resting — it is not
placed, and the CLI reports it as QUEUED rather than successful. Track the
returned order ID with `decibel-cli spot order-history` (final state) and
`decibel-cli spot history` (fills). `spot orders` only helps for gtc/post-only
orders: an IOC order fills or cancels the moment it is placed and never rests,
so an empty open-orders list says nothing about it.

### Markets

```bash
decibel-cli markets ls               # List all perp markets
decibel-cli markets price <symbol>   # Get price
decibel-cli markets book <symbol>    # Order book
```

## Global Options

| Option              | Description                       |
| ------------------- | --------------------------------- |
| `--json`            | Output in JSON format             |
| `--network <name>`  | Network (mainnet, testnet, local) |
| `--account <alias>` | Use specific account              |
| `-h, --help`        | Show help                         |

## MCP Server (AI Agent Integration)

The MCP server allows AI agents like Claude to interact with Decibel DEX programmatically.

### Configuration (Claude Code CLI)

The fastest way to add the MCP server to Claude Code is from the terminal:

```bash
claude mcp add --transport stdio \
  --env DECIBEL_PRIVATE_KEY=ed25519-priv-0x... \
  --env DECIBEL_SUBACCOUNT_ADDRESS=0x... \
  --env DECIBEL_NETWORK=testnet \
  --env DECIBEL_NODE_API_KEY=aptoslabs_... \
  -- decibel npx -y --package @decibeltrade/cli decibel-mcp
```

Replace the env var values with your own. You can omit `DECIBEL_PRIVATE_KEY` and `DECIBEL_SUBACCOUNT_ADDRESS` if you've added a default account with `decibel-cli account add`.

### Configuration (JSON)

Alternatively, add to your Claude config file (`~/.claude/settings.json` for Claude Code, or Claude Desktop's config):

```json
{
  "mcpServers": {
    "decibel": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "-p", "@decibeltrade/cli", "decibel-mcp"],
      "env": {
        "DECIBEL_NETWORK": "testnet",
        "DECIBEL_PRIVATE_KEY": "ed25519-priv-0x...",
        "DECIBEL_SUBACCOUNT_ADDRESS": "0x...",
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
| `cancel_order`            | Cancel an order                  |
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
| `get_price`               | Get market price                 |
| `get_orderbook`           | Get order book snapshot          |
| `get_balances`            | Get account balances             |
| `get_trade_history`       | Get trade fill history           |
| `get_order_history`       | Get order history (all states)   |
| `get_twap_history`        | Get TWAP order history           |
| `get_funding_history`     | Get funding rate payment history |
| `place_spot_limit_order`  | Place a spot limit order         |
| `place_spot_market_order` | Place a spot market order (IOC)  |
| `cancel_spot_order`       | Cancel a spot order              |
| `cancel_all_spot_orders`  | Cancel all open spot orders      |
| `get_spot_markets`        | List all spot markets            |
| `get_spot_price`          | Get spot price and 24h stats     |
| `get_spot_orderbook`      | Get spot order book snapshot     |
| `get_spot_orders`         | Get open spot orders             |
| `get_spot_balances`       | Get spot holdings                |
| `get_spot_trade_history`  | Get spot trade fill history      |
| `get_spot_order_history`  | Get spot order history           |

## Environment Variables

| Variable                      | Description                                     |
| ----------------------------- | ----------------------------------------------- |
| `DECIBEL_PRIVATE_KEY`         | API wallet private key for signing transactions |
| `DECIBEL_SUBACCOUNT_ADDRESS`  | Subaccount address for read operations          |
| `DECIBEL_NETWORK`             | Network (mainnet, testnet, local)               |
| `DECIBEL_NODE_API_KEY`        | Node API key for higher rate limits             |
| `DECIBEL_GAS_STATION_API_KEY` | Gas station API key for sponsored transactions  |

## Development

```bash
# Clone the repository
git clone git@github.com:decibeltrade/decibel-cli.git
cd decibel-cli

# Install dependencies
pnpm install

# Build
pnpm run build

# Run locally
node dist/index.js --help

# Run tests
pnpm test
```

## Documentation

- [SKILL.md](./skills/decibel/SKILL.md) - Skill definition for AI agents
- [reference.md](./skills/decibel/reference.md) - Complete command reference
- [examples.md](./skills/decibel/examples.md) - Workflow examples

## License

MIT
