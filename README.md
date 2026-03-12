# Decibel CLI

Command-line interface for trading on [Decibel DEX](https://decibel.trade) - a perpetual futures exchange built on Aptos blockchain.

**Target users:** AI agents (primary) and human power users (secondary)

## Features

- **Trading Commands** - Place/cancel orders, manage positions, set leverage
- **Account Management** - Multi-account support with encrypted local storage
- **Market Data** - Real-time prices, orderbook with depth visualization
- **Watch Mode** - WebSocket-powered real-time updates
- **MCP Server** - AI agent integration via Model Context Protocol
- **Affiliate Management** - Generate referral codes from ETH/Solana/Aptos addresses with collision checking
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

### Affiliate

Generate and manage referral codes from ETH, Solana, or Aptos wallet addresses. Supports multi-chain input — ETH and Solana addresses are automatically derived to Aptos addresses using the derivable account pattern (scheme 0x05).

#### `create-codes`

Create referral codes for affiliates (KOLs/influencers) or builders (app developers).

```bash
# Affiliate code (default)
decibel-cli affiliate create-codes --name "Alice" --address 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045

# Builder code (non-affiliate)
decibel-cli affiliate create-codes --builder --name "AppDev" --address 0x...

# Batch from CSV file
decibel-cli affiliate create-codes --file affiliates.csv

# With collision check + auto-insert into ClickHouse
decibel-cli affiliate create-codes --file affiliates.csv \
  --clickhouse-url https://clickhouse.example.com --execute
```

**CSV format:** `name,address` (comma or tab separated, optional header row)

```csv
name,address
Alice,0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
Bob,TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA
Charlie,0x0000000000000000000000000000000000000000000000000000000000000001
```

| Option                   | Description                                                                  |
| ------------------------ | ---------------------------------------------------------------------------- |
| `--file <path>`          | CSV file with `name,address` columns                                         |
| `--name <name>`          | Name (single entry mode)                                                     |
| `--address <address>`    | Wallet address: ETH (0x+40 hex), Solana (base58), or Aptos (0x+64 hex)       |
| `--builder`              | Create non-affiliate builder codes (`is_affiliate=false`)                    |
| `--max-usage <n>`        | Max redemptions per code (default: 100)                                      |
| `--clickhouse-url <url>` | ClickHouse URL for collision check (or set `DECIBEL_CLICKHOUSE_URL` env var) |
| `--execute`              | Insert codes into ClickHouse (requires `--clickhouse-url`)                   |

**Affiliate vs Builder codes:**

- **Affiliate** (`is_affiliate=true`, default) — for KOLs/influencers. Always visible to users. Address collision check prevents duplicate affiliate codes per address.
- **Builder** (`--builder`, `is_affiliate=false`) — for app developers building on Decibel. Only visible to users meeting the volume threshold. No address collision check (a builder can have multiple codes).

**Modes of operation:**

1. **SQL-only (default):** Outputs INSERT SQL + collision check SQL for manual execution. No database connection needed.
2. **Collision check only (`--clickhouse-url`):** Connects to ClickHouse read-only to check for code/address collisions, then outputs INSERT SQL for non-colliding entries.
3. **Execute (`--clickhouse-url --execute`):** Checks collisions, inserts one-by-one, verifies each insert, and prints reconciliation SQL for any failures.

#### `update-max-usage`

Update the `max_usage` limit on existing referral codes. Requires a ClickHouse connection to look up current state.

```bash
# Look up by code and output SQL
decibel-cli affiliate update-max-usage --code ABC123 --max-usage 500 \
  --clickhouse-url https://clickhouse.example.com

# Look up by owner address and execute
decibel-cli affiliate update-max-usage --address 0x... --max-usage 500 \
  --clickhouse-url https://clickhouse.example.com --execute
```

| Option                   | Description                                              |
| ------------------------ | -------------------------------------------------------- |
| `--code <code>`          | Referral code to update                                  |
| `--address <address>`    | Owner address — updates all codes for this address       |
| `--max-usage <n>`        | New max usage value (required)                           |
| `--clickhouse-url <url>` | ClickHouse URL (or set `DECIBEL_CLICKHOUSE_URL` env var) |
| `--execute`              | Apply update to ClickHouse                               |

The command displays the current state (code, owner, max_usage, times redeemed, affiliate status), validates that the new max_usage is not below current redemptions, and either outputs SQL or executes the update with verification.

> **Warning — ClickHouse write access**
>
> The `--execute` flag performs INSERT operations on the `managed_referral_codes` table.
> The connection string used with `--clickhouse-url` (or `DECIBEL_CLICKHOUSE_URL`) should
> point to a ClickHouse user scoped to only this table. A dedicated read/write user for
> `managed_referral_codes` is planned — until then, use the `--execute` flag with caution
> and prefer the default SQL-output mode for auditable manual execution.

## Global Options

| Option              | Description                     |
| ------------------- | ------------------------------- |
| `--json`            | Output in JSON format           |
| `--network <name>`  | Network (testnet, netna, local) |
| `--account <alias>` | Use specific account            |
| `-h, --help`        | Show help                       |

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
  -- decibel npx -y tsx /path/to/decibel-cli/src/mcp-server.ts
```

Replace the env var values and `/path/to/decibel-cli` with your own. You can omit `DECIBEL_PRIVATE_KEY` and `DECIBEL_SUBACCOUNT_ADDRESS` if you've added a default account with `decibel-cli account add`.

### Configuration (JSON)

Alternatively, add to your Claude config file (`~/.claude/settings.json` for Claude Code, or Claude Desktop's config):

```json
{
  "mcpServers": {
    "decibel": {
      "type": "stdio",
      "command": "npx",
      "args": ["tsx", "/path/to/decibel-cli/src/mcp-server.ts"],
      "cwd": "/path/to/decibel-cli",
      "env": {
        "DECIBEL_NETWORK": "testnet",
        "DECIBEL_PRIVATE_KEY": "0x...",
        "DECIBEL_SUBACCOUNT_ADDRESS": "0x...",
        "DECIBEL_NODE_API_KEY": "your-node-api-key"
      }
    }
  }
}
```

Replace `/path/to/decibel-cli` with the actual path to your decibel-cli installation.

> **Note:** We use `tsx` instead of `node` because `@decibeltrade/sdk` has an ESM compatibility issue - its compiled JavaScript imports lack `.js` extensions, which Node.js ESM requires. The `tsx` loader handles this automatically. This will be resolved when the SDK is updated to use `moduleResolution: "NodeNext"` in its tsconfig.

### Available MCP Tools

| Tool                 | Description               |
| -------------------- | ------------------------- |
| `place_limit_order`  | Place a limit order       |
| `place_market_order` | Place a market order      |
| `cancel_order`       | Cancel an order           |
| `set_leverage`       | Set leverage for a market |
| `get_positions`      | Get open positions        |
| `get_orders`         | Get open orders           |
| `get_markets`        | List all markets          |
| `get_price`          | Get market price          |
| `get_orderbook`      | Get order book            |
| `get_balances`       | Get account balances      |

## Environment Variables

| Variable                      | Description                                     |
| ----------------------------- | ----------------------------------------------- |
| `DECIBEL_PRIVATE_KEY`         | API wallet private key for signing transactions |
| `DECIBEL_SUBACCOUNT_ADDRESS`  | Subaccount address for read operations          |
| `DECIBEL_ACCOUNT_ALIAS`       | Account alias from stored accounts              |
| `DECIBEL_NETWORK`             | Network (testnet, netna, local)                 |
| `DECIBEL_NODE_API_KEY`        | Node API key for higher rate limits             |
| `DECIBEL_GAS_STATION_API_KEY` | Gas station API key for sponsored transactions  |
| `DECIBEL_CLICKHOUSE_URL`      | ClickHouse URL for affiliate collision checks   |

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
