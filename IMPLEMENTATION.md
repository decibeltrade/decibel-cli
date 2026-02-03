# Decibel CLI - Implementation Reference

This document maps the original implementation plan to the actual files created.

## Implementation Status

### Completed Features

| Feature | Status | Files |
|---------|--------|-------|
| CLI Entry Point | ✅ | `src/index.ts` |
| Account Management | ✅ | `src/commands/account/index.ts` |
| Markets Commands | ✅ | `src/commands/markets/index.ts` |
| Trading Commands | ✅ | `src/commands/trade/index.ts` |
| Funds Commands | ✅ | `src/commands/funds/index.ts` |
| MCP Server | ✅ | `src/mcp-server.ts`, `src/mcp/server.ts` |
| SQLite Storage | ✅ | `src/storage/database.ts`, `src/storage/accounts.ts` |
| Utility Modules | ✅ | `src/utils/config.ts`, `src/utils/output.ts`, `src/utils/encryption.ts` |
| SDK Factory | ✅ | `src/services/dex-factory.ts` |
| Skill Documentation | ✅ | `skills/decibel/SKILL.md`, `reference.md`, `examples.md` |

### Not Yet Implemented

| Feature | Priority | Notes |
|---------|----------|-------|
| Vaults Commands | Medium | `vaults ls/info/deposit/withdraw` |
| Server Mode | Low | Background WebSocket cache server |
| Unit Tests | Medium | Test files in `tests/` directory |

## File Structure (Actual)

```
decibel-cli/
├── package.json                 # Dependencies and scripts
├── tsconfig.json                # TypeScript configuration
├── vitest.config.ts             # Test configuration
├── .env.example                 # Environment variable template
├── README.md                    # Project documentation
├── IMPLEMENTATION.md            # This file
│
├── skills/decibel/              # AI Agent Documentation
│   ├── SKILL.md                 # Skill definition with frontmatter
│   ├── reference.md             # Complete command reference
│   └── examples.md              # Workflow examples
│
├── src/
│   ├── index.ts                 # CLI entry point (Commander.js)
│   ├── mcp-server.ts            # MCP server entry point
│   │
│   ├── commands/
│   │   ├── account/index.ts     # account add/ls/remove/set-default/info
│   │   ├── trade/index.ts       # order limit/market, cancel, positions, orders, leverage
│   │   ├── markets/index.ts     # ls, price, book (with -w watch mode)
│   │   └── funds/index.ts       # deposit, withdraw, history, balances
│   │
│   ├── mcp/
│   │   ├── server.ts            # MCP server with all tool handlers
│   │   └── tools/
│   │       ├── index.ts         # Re-exports
│   │       ├── trading-tools.ts # place_order, cancel, set_leverage, positions
│   │       ├── market-tools.ts  # get_markets, get_price, get_orderbook
│   │       └── account-tools.ts # get_balances, deposit, withdraw
│   │
│   ├── storage/
│   │   ├── index.ts             # Re-exports
│   │   ├── database.ts          # SQLite initialization and connection
│   │   └── accounts.ts          # Account CRUD operations
│   │
│   ├── services/
│   │   ├── index.ts             # Re-exports
│   │   └── dex-factory.ts       # SDK instance creation, account resolution
│   │
│   └── utils/
│       ├── index.ts             # Re-exports
│       ├── config.ts            # Network configs, env vars, paths
│       ├── output.ts            # Table formatting, colors, JSON output
│       └── encryption.ts        # Private key encryption/decryption
│
└── tests/                       # (Empty, tests not yet written)
```

## SDK Type Mapping

The Decibel SDK uses specific field names. Here's the mapping from common names to SDK types:

### Market Prices (`MarketPriceSchema`)
| CLI Display | SDK Field |
|-------------|-----------|
| Mark Price | `mark_px` |
| Oracle Price | `oracle_px` |
| Funding Rate | `funding_rate_bps` (in basis points) |
| Open Interest | `open_interest` |

### Account Overview (`AccountOverviewSchema`)
| CLI Display | SDK Field |
|-------------|-----------|
| Account Value | `perp_equity_balance` |
| Unrealized PnL | `unrealized_pnl` |
| Withdrawable (Cross) | `usdc_cross_withdrawable_balance` |
| Withdrawable (Isolated) | `usdc_isolated_withdrawable_balance` |
| Total Margin | `total_margin` |

### Open Orders (`UserOpenOrderSchema`)
| CLI Display | SDK Field |
|-------------|-----------|
| Order ID | `order_id` |
| Market | `market` (address) |
| Size | `remaining_size` |
| Price | `price` |
| Status | `details` |

### Fund History (`UserFundSchema`)
| CLI Display | SDK Field |
|-------------|-----------|
| Type | `movement_type` (deposit/withdrawal) |
| Amount | `amount` |
| Balance After | `balance_after` |
| Time | `timestamp` |

## Authentication Priority

When resolving which account to use for transactions:

1. `--account <alias>` flag (named account from storage)
2. `DECIBEL_PRIVATE_KEY` environment variable
3. Default account from SQLite database (`~/.decibel/data.db`)

## MCP Server Tools

The MCP server exposes these tools for AI agent integration:

### Trading Tools
- `place_limit_order` - Place limit order with price, size, side, TIF
- `place_market_order` - Market order with slippage tolerance
- `cancel_order` - Cancel by order ID and market
- `set_leverage` - Set leverage for a market
- `get_positions` - Get all open positions
- `get_orders` - Get all open orders

### Market Tools
- `get_markets` - List all available markets
- `get_price` - Get price for a specific market
- `get_orderbook` - Get order book with depth

### Account Tools
- `get_balances` - Get wallet and trading account balances
- `deposit` - Deposit USDC to trading account
- `withdraw` - Withdraw USDC from trading account

## Build & Run Commands

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run CLI
node dist/index.js --help

# Run MCP Server
node dist/mcp-server.js
```

## Next Steps

1. **Add Tests** - Create unit tests for storage, utilities, and commands
2. **Implement Vaults** - Add vault management commands
3. **Add Server Mode** - Background WebSocket caching server
4. **Publish to npm** - Make available as `npm install -g decibel-cli`
