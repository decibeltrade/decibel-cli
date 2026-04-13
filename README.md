# Decibel CLI

Command-line interface and MCP server for trading on [Decibel DEX](https://decibel.trade) - a perpetual futures exchange built on Aptos blockchain.

Includes a built-in [MCP server](#mcp-server-ai-agent-integration) with 25 tools, enabling AI agents like Claude to trade, monitor positions, and manage accounts through natural language.

**Target users:** AI agents (primary) and human power users (secondary)

## Features

- **Full Order Types** - Limit, market, stop-limit, stop-market, and TWAP orders
- **TP/SL Management** - Set, list, and cancel take-profit/stop-loss orders
- **Account Management** - Multi-account support with encrypted local storage
- **Market Data** - Real-time prices, orderbook with depth visualization
- **Watch Mode** - WebSocket-powered real-time updates
- **MCP Server** - 25 tools for AI agent integration via Model Context Protocol
- **JSON Output** - `--json` flag on all commands for machine-readable output

## Installation

```bash
npm install -g decibel-cli
```

## Quick Start

```bash
# Set required environment variables
export DECIBEL_NODE_API_KEY=aptoslabs_...        # Node API key (from geomi.dev)
export DECIBEL_NETWORK=testnet                   # Network (mainnet, testnet, netna, local)

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

### Markets

```bash
decibel-cli markets ls               # List all markets
decibel-cli markets price <symbol>   # Get price
decibel-cli markets book <symbol>    # Order book
```

## Global Options

| Option              | Description                              |
| ------------------- | ---------------------------------------- |
| `--json`            | Output in JSON format                    |
| `--network <name>`  | Network (mainnet, testnet, netna, local) |
| `--account <alias>` | Use specific account                     |
| `-h, --help`        | Show help                                |

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
  -- decibel npx -y -p @decibeltrade/cli decibel-mcp
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

## Environment Variables

| Variable                      | Description                                     |
| ----------------------------- | ----------------------------------------------- |
| `DECIBEL_PRIVATE_KEY`         | API wallet private key for signing transactions |
| `DECIBEL_SUBACCOUNT_ADDRESS`  | Subaccount address for read operations          |
| `DECIBEL_ACCOUNT_ALIAS`       | Account alias from stored accounts              |
| `DECIBEL_NETWORK`             | Network (mainnet, testnet, netna, local)        |
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
