---
name: decibel
description: Trade perpetuals on Decibel DEX (Aptos blockchain). Real-time positions & P&L tracking, orderbook monitoring, multi-account management, and MCP server for AI agent integration.
emoji: ⚡
homepage: https://github.com/decibeltrade/decibel-cli

requires:
  bins:
    - decibel-cli
  env:
    - DECIBEL_PRIVATE_KEY

install:
  - npm install -g decibel-cli

config:
  requiredEnv:
    - name: DECIBEL_PRIVATE_KEY
      description: Private key for trading (hex string starting with 0x)
  optionalEnv:
    - name: DECIBEL_NETWORK
      description: Network to use (testnet, netna, local). Defaults to testnet.
    - name: DECIBEL_NODE_API_KEY
      description: Node API key for higher rate limits
  stateDirs:
    - ~/.decibel
---

# Decibel CLI Skill

Trade crypto perpetuals on Decibel DEX from the command line. Built on Aptos blockchain.

## What This Skill Does

This skill enables you to:

- **Trade Perpetuals** - BTC, ETH, and other assets with up to 50x leverage
- **Monitor Positions in Real-Time** - WebSocket-powered live updates with color-coded PnL
- **Manage Multiple Accounts** - Store and switch between trading accounts
- **View Market Data** - Prices, orderbooks, funding rates
- **Deposit/Withdraw Funds** - Move USDC between wallet and trading account

## Setup Instructions

### 1. Check if CLI is Installed

```bash
which decibel-cli
```

If not found, install it:

```bash
npm install -g decibel-cli
```

### 2. Verify Installation

```bash
decibel-cli --version
decibel-cli --help
```

### 3. Set Up API Key for Trading

To execute trades, you need an Aptos wallet with a private key:

1. Create a new wallet or use an existing Aptos wallet
2. Export the private key (starts with `0x`)
3. Add an account to local storage (Recommended):

```bash
decibel-cli account add
# Follow the interactive prompts
```

Or set the environment variable:

```bash
export DECIBEL_PRIVATE_KEY=0x...your_private_key...
```

### 4. Get Testnet USDC

For testnet trading, you'll need testnet USDC:

1. Visit https://app.decibel.trade (testnet)
2. Connect your wallet
3. Use the faucet to get testnet USDC

## Quick Command Reference

### Account Management

```bash
decibel-cli account add          # Add new account (interactive)
decibel-cli account ls           # List all accounts
decibel-cli account set-default  # Change default account
decibel-cli account remove       # Remove an account
decibel-cli account info         # Show balances and equity
```

### Viewing Data

```bash
decibel-cli trade positions           # View positions
decibel-cli trade positions -w        # Watch mode (real-time)
decibel-cli trade orders              # View open orders
decibel-cli funds balances            # View balances
```

### Trading

```bash
# List markets first to see available symbols
decibel-cli markets ls

# Place limit order
decibel-cli trade order limit buy 0.01 BTC-PERP 50000

# Place market order
decibel-cli trade order market buy 0.01 BTC-PERP

# Cancel order
decibel-cli trade cancel <orderId> --market BTC-PERP

# Set leverage
decibel-cli trade set-leverage BTC-PERP 10
```

### Market Data

```bash
decibel-cli markets ls           # List all markets
decibel-cli markets price BTC-PERP       # Get price
decibel-cli markets price BTC-PERP -w    # Watch price
decibel-cli markets book BTC-PERP        # Order book
decibel-cli markets book BTC-PERP -w     # Watch order book
```

### Fund Management

```bash
decibel-cli funds deposit 100    # Deposit 100 USDC
decibel-cli funds withdraw 50    # Withdraw 50 USDC
decibel-cli funds history        # Deposit/withdraw history
decibel-cli funds balances       # View all balances
```

## Global Options

| Option              | Description                           |
| ------------------- | ------------------------------------- |
| `--json`            | Output in JSON format (for scripting) |
| `--network <name>`  | Use specific network (testnet/netna/local) |
| `--account <alias>` | Use specific account                  |
| `-h, --help`        | Show help                             |

## MCP Server Mode

For AI agent integration, run as an MCP server:

```bash
decibel-cli mcp-server
```

Or configure in Claude Desktop's config:

```json
{
  "mcpServers": {
    "decibel": {
      "command": "decibel-cli",
      "args": ["mcp-server"],
      "env": {
        "DECIBEL_PRIVATE_KEY": "0x..."
      }
    }
  }
}
```

## Further Reading

See [reference.md](./reference.md) for complete command documentation and [examples.md](./examples.md) for workflow examples.

## Common Issues

1. **"No account configured"**: Run `decibel-cli account add` or set `DECIBEL_PRIVATE_KEY`
2. **"Insufficient balance"**: Deposit USDC with `decibel-cli funds deposit <amount>`
3. **Transaction failures**: Check you have enough APT for gas fees
