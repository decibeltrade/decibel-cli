# Decibel CLI

Command-line interface for trading on [Decibel DEX](https://decibel.trade) - a perpetual futures exchange built on Aptos blockchain.

**Target users:** AI agents (primary) and human power users (secondary)

## Features

- **Trading Commands** - Place/cancel orders, manage positions, set leverage
- **Account Management** - Multi-account support with encrypted local storage
- **Market Data** - Real-time prices, orderbook with depth visualization
- **Fund Management** - Deposit/withdraw USDC
- **Watch Mode** - WebSocket-powered real-time updates
- **MCP Server** - AI agent integration via Model Context Protocol
- **JSON Output** - `--json` flag on all commands for machine-readable output

## Installation

```bash
npm install -g decibel-cli
```

## Quick Start

```bash
# Add your trading account
decibel-cli account add

# List available markets
decibel-cli markets ls

# Check BTC price
decibel-cli markets price BTC-PERP

# Place a limit order
decibel-cli trade order limit buy 0.01 BTC-PERP 50000

# View positions
decibel-cli trade positions
```

## Authentication

The CLI supports multiple authentication methods (in priority order):

1. `--account <alias>` flag - Use a named account from local storage
2. `DECIBEL_PRIVATE_KEY` environment variable
3. Default account from SQLite database (`~/.decibel/data.db`)

### Adding an Account

```bash
decibel-cli account add
# Follow interactive prompts to:
# - Choose type (api-wallet or read-only)
# - Enter private key or address
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
decibel-cli trade order limit <side> <size> <symbol> <price>
decibel-cli trade order market <side> <size> <symbol>
decibel-cli trade cancel <orderId> --market <symbol>
decibel-cli trade cancel-all
decibel-cli trade set-leverage <symbol> <leverage>
decibel-cli trade positions [-w]
decibel-cli trade orders [-w]
decibel-cli trade history
```

### Markets
```bash
decibel-cli markets ls               # List all markets
decibel-cli markets price <symbol>   # Get price
decibel-cli markets book <symbol>    # Order book
```

### Funds
```bash
decibel-cli funds deposit <amount>   # Deposit USDC
decibel-cli funds withdraw <amount>  # Withdraw USDC
decibel-cli funds balances           # View balances
decibel-cli funds history            # Deposit/withdraw history
```

## Global Options

| Option              | Description                        |
| ------------------- | ---------------------------------- |
| `--json`            | Output in JSON format              |
| `--network <name>`  | Network (testnet, netna, local)    |
| `--account <alias>` | Use specific account               |
| `-h, --help`        | Show help                          |

## MCP Server (AI Agent Integration)

The MCP server allows AI agents like Claude to interact with Decibel DEX programmatically.

### Configuration

Add to your Claude config file (`~/.claude.json` for Claude Code, or Claude Desktop's config):

```json
{
  "mcpServers": {
    "decibel": {
      "type": "stdio",
      "command": "npx",
      "args": ["tsx", "/path/to/decibel-cli/dist/mcp-server.js"],
      "cwd": "/path/to/decibel-cli",
      "env": {
        "DECIBEL_NETWORK": "testnet",
        "DECIBEL_PRIVATE_KEY": "0x..."
      }
    }
  }
}
```

Replace `/path/to/decibel-cli` with the actual path to your decibel-cli installation.

> **Note:** We use `tsx` instead of `node` because `@decibeltrade/sdk` has an ESM compatibility issue - its compiled JavaScript imports lack `.js` extensions, which Node.js ESM requires. The `tsx` loader handles this automatically. This will be resolved when the SDK is updated to use `moduleResolution: "NodeNext"` in its tsconfig.

### Available MCP Tools

| Tool               | Description                    |
| ------------------ | ------------------------------ |
| `place_limit_order`| Place a limit order           |
| `place_market_order`| Place a market order          |
| `cancel_order`     | Cancel an order               |
| `set_leverage`     | Set leverage for a market     |
| `get_positions`    | Get open positions            |
| `get_orders`       | Get open orders               |
| `get_markets`      | List all markets              |
| `get_price`        | Get market price              |
| `get_orderbook`    | Get order book                |
| `get_balances`     | Get account balances          |
| `deposit`          | Deposit USDC                  |
| `withdraw`         | Withdraw USDC                 |

## Environment Variables

| Variable                     | Description                              |
| ---------------------------- | ---------------------------------------- |
| `DECIBEL_PRIVATE_KEY`        | Private key for trading                  |
| `DECIBEL_NETWORK`            | Network (testnet, netna, local)          |
| `DECIBEL_NODE_API_KEY`       | Node API key for higher rate limits      |
| `DECIBEL_GAS_STATION_API_KEY`| Gas station API key for sponsored txs    |

## Development

```bash
# Clone the repository
git clone git@github.com:decibeltrade/decibel-cli.git
cd decibel-cli

# Install dependencies
npm install

# Build
npm run build

# Run locally
node dist/index.js --help

# Run tests
npm test
```

## Documentation

- [SKILL.md](./skills/decibel/SKILL.md) - Skill definition for AI agents
- [reference.md](./skills/decibel/reference.md) - Complete command reference
- [examples.md](./skills/decibel/examples.md) - Workflow examples

## License

MIT
