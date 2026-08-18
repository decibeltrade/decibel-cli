# Decibel CLI - Implementation Reference

This document maps the original implementation plan to the actual files created.

## Implementation Status

### Completed Features

| Feature              | Status | Files                                                                   |
| -------------------- | ------ | ----------------------------------------------------------------------- |
| CLI Entry Point      | Done   | `src/index.ts`                                                          |
| Shared Actions Layer | Done   | `src/actions/` (28 action files with Zod schemas)                       |
| Account Management   | Done   | `src/commands/account/index.ts`                                         |
| Markets Commands     | Done   | `src/commands/markets/index.ts`                                         |
| Trading Commands     | Done   | `src/commands/trade/index.ts`                                           |
| MCP Server           | Done   | `src/mcp-server.ts`, `src/mcp/server.ts`                                |
| SQLite Storage       | Done   | `src/storage/database.ts`, `src/storage/accounts.ts`                    |
| Utility Modules      | Done   | `src/utils/config.ts`, `src/utils/output.ts`, `src/utils/encryption.ts` |
| SDK Factory          | Done   | `src/services/dex-factory.ts`                                           |
| Skill Documentation  | Done   | `skills/decibel/SKILL.md`, `reference.md`, `examples.md`                |
| Unit Tests           | Done   | `tests/` directory                                                      |

### Not Yet Implemented

| Feature         | Priority | Notes                             |
| --------------- | -------- | --------------------------------- |
| Vaults Commands | Medium   | `vaults ls/info/deposit/withdraw` |
| Server Mode     | Low      | Background WebSocket cache server |

## File Structure (Actual)

```
decibel-cli/
+-- package.json                 # Dependencies and scripts
+-- tsconfig.json                # TypeScript configuration
+-- vitest.config.ts             # Test configuration
+-- .env.example                 # Environment variable template
+-- README.md                    # Project documentation
+-- IMPLEMENTATION.md            # This file
|
+-- skills/decibel/              # AI Agent Documentation
|   +-- SKILL.md                 # Skill definition with frontmatter
|   +-- reference.md             # Complete command reference
|   +-- examples.md              # Workflow examples
|
+-- src/
|   +-- index.ts                 # CLI entry point (Commander.js)
|   +-- mcp-server.ts            # MCP server entry point
|   |
|   +-- actions/                 # Shared business logic (CLI + MCP)
|   |   +-- index.ts             # Barrel re-exports
|   |   +-- utils.ts             # parseSide, roundToTick, findMarket, etc.
|   |   +-- place-limit-order.ts
|   |   +-- place-market-order.ts
|   |   +-- place-stop-limit-order.ts
|   |   +-- place-stop-market-order.ts
|   |   +-- place-twap-order.ts
|   |   +-- close-position.ts
|   |   +-- cancel-order.ts
|   |   +-- cancel-all-orders.ts
|   |   +-- cancel-twap-order.ts
|   |   +-- place-tp-sl.ts
|   |   +-- cancel-tp-sl.ts
|   |   +-- get-tp-sl.ts
|   |   +-- set-leverage.ts
|   |   +-- set-margin-type.ts
|   |   +-- get-positions.ts
|   |   +-- get-orders.ts
|   |   +-- get-balances.ts
|   |   +-- get-markets.ts
|   |   +-- get-price.ts
|   |   +-- get-orderbook.ts
|   |   +-- get-active-twaps.ts
|   |   +-- get-trade-history.ts
|   |   +-- get-order-history.ts
|   |   +-- get-twap-history.ts
|   |   +-- get-funding-history.ts
|   |
|   +-- commands/
|   |   +-- account/index.ts     # account add/ls/remove/set-default/info
|   |   +-- trade/index.ts       # all trading commands (thin CLI wrappers over actions)
|   |   +-- markets/index.ts     # ls, price, book (with -w watch mode)
|   |
|   +-- mcp/
|   |   +-- server.ts            # MCP server (imports directly from actions/)
|   |
|   +-- storage/
|   |   +-- index.ts             # Re-exports
|   |   +-- database.ts          # SQLite initialization and connection
|   |   +-- accounts.ts          # Account CRUD operations
|   |
|   +-- services/
|   |   +-- index.ts             # Re-exports
|   |   +-- dex-factory.ts       # SDK instance creation, account resolution
|   |
|   +-- utils/
|       +-- index.ts             # Re-exports
|       +-- config.ts            # Network configs, env vars, paths
|       +-- output.ts            # Table formatting, colors, JSON output
|       +-- encryption.ts        # Private key encryption/decryption
|
+-- tests/
    +-- actions/utils.test.ts    # Action utility function tests
    +-- actions/actions.test.ts  # Action integration tests (mocked SDK)
    +-- commands/trade.test.ts   # Trade command unit tests
    +-- services/dex-factory.test.ts # SDK factory tests
    +-- storage/accounts.test.ts # Account storage tests
    +-- storage/database.test.ts # Database tests
    +-- utils/config.test.ts     # Config utility tests
    +-- utils/encryption.test.ts # Encryption utility tests
    +-- utils/output.test.ts     # Output formatting tests
```

## Account System

The CLI uses **API wallets** created at [app.decibel.trade/api](https://app.decibel.trade/api) for signing transactions on behalf of Decibel subaccounts. API wallets allow programmatic trading without permitting deposits or withdrawals.

### Account Types

- **api-wallet** - Has a private key for signing transactions, requires subaccount address
- **read-only** - Only has a subaccount address for monitoring positions/balances

### Account Resolution

When resolving which account to use for transactions:

1. `--account <alias>` flag (named account from storage)
2. `DECIBEL_PRIVATE_KEY` environment variable
3. `DECIBEL_ACCOUNT_ALIAS` environment variable
4. Default account from SQLite database (`~/.decibel/data.db`)

When resolving subaccount address for read-only operations:

1. `--account <alias>` flag
2. `DECIBEL_SUBACCOUNT_ADDRESS` environment variable
3. `DECIBEL_ACCOUNT_ALIAS` environment variable
4. Default account from SQLite database

## SDK Type Mapping

The Decibel SDK uses specific field names. Here's the mapping from common names to SDK types:

### Market Prices (`MarketPriceSchema`)

| CLI Display   | SDK Field                            |
| ------------- | ------------------------------------ |
| Mark Price    | `mark_px`                            |
| Oracle Price  | `oracle_px`                          |
| Funding Rate  | `funding_rate_bps` (in basis points) |
| Open Interest | `open_interest`                      |

### Account Overview (`AccountOverviewSchema`)

| CLI Display             | SDK Field                            |
| ----------------------- | ------------------------------------ |
| Account Value           | `perp_equity_balance`                |
| Unrealized PnL          | `unrealized_pnl`                     |
| Withdrawable (Cross)    | `usdc_cross_withdrawable_balance`    |
| Withdrawable (Isolated) | `usdc_isolated_withdrawable_balance` |
| Total Margin            | `total_margin`                       |

### Open Orders (`UserOpenOrderSchema`)

| CLI Display | SDK Field          |
| ----------- | ------------------ |
| Order ID    | `order_id`         |
| Market      | `market` (address) |
| Size        | `remaining_size`   |
| Price       | `price`            |
| Status      | `details`          |

## MCP Server Tools

The MCP server exposes these tools for AI agent integration:

### Trading Tools

- `place_limit_order` - Place limit order with price, size, side, TIF
- `place_market_order` - Market order with slippage tolerance
- `place_stop_limit_order` - Stop limit order (triggers at stop price, posts as limit)
- `place_stop_market_order` - Stop market order (triggers at stop price, executes as IOC)
- `place_twap_order` - TWAP order (time-weighted execution over duration)
- `close_position` - Close position with reduce-only market order
- `cancel_order` - Cancel by order ID and market
- `cancel_all_orders` - Cancel all open orders (optional market filter)
- `cancel_twap_order` - Cancel an active TWAP order
- `place_tp_sl` - Set TP/SL for a position (full or partial size)
- `cancel_tp_sl` - Cancel a TP/SL order
- `set_leverage` - Set leverage for a market
- `set_margin_type` - Switch cross/isolated margin

### Read Tools

- `get_positions` - Get all open positions
- `get_orders` - Get all open orders
- `get_tp_sl` - Get TP/SL orders for a market position
- `get_active_twaps` - Get active TWAP orders
- `get_trade_history` - Get trade fill history
- `get_order_history` - Get order history (all states)
- `get_twap_history` - Get TWAP order history
- `get_funding_history` - Get funding rate payment history

### Market Tools

- `get_markets` - List all available markets
- `get_price` - Get price for a specific market
- `get_orderbook` - Get order book snapshot (via WebSocket)

### Account Tools

- `get_balances` - Get trading account balances and margin info

## Environment Variables

| Variable                      | Description                                                     |
| ----------------------------- | --------------------------------------------------------------- |
| `DECIBEL_PRIVATE_KEY`         | API wallet private key for signing transactions                 |
| `DECIBEL_SUBACCOUNT_ADDRESS`  | Subaccount address for read operations                          |
| `DECIBEL_ACCOUNT_ALIAS`       | Account alias from stored accounts                              |
| `DECIBEL_NETWORK`             | Network: mainnet, testnet, local (default: testnet)             |
| `DECIBEL_NODE_API_KEY`        | Node API key for higher rate limits (from geomi.dev)            |
| `DECIBEL_GAS_STATION_API_KEY` | Gas station API key for sponsored transactions (from geomi.dev) |

## Build & Run Commands

```bash
# Install dependencies
pnpm install

# Build TypeScript
pnpm run build

# Run CLI
node dist/index.js --help

# Run MCP Server
node dist/mcp-server.js

# Run tests
pnpm test
```

## Next Steps

1. **Implement Vaults** - Add vault management commands
2. **Add Server Mode** - Background WebSocket caching server
3. **Publish to npm** - Make available as `npm install -g decibel-cli`
