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
      description: API wallet private key for signing transactions (hex string starting with 0x). Create an API wallet at https://app.decibel.trade/api.
    - name: DECIBEL_SUBACCOUNT_ADDRESS
      description: Subaccount address for trading (hex string starting with 0x)
  optionalEnv:
    - name: DECIBEL_ACCOUNT_ALIAS
      description: Account alias from stored accounts (alternative to env vars)
    - name: DECIBEL_NETWORK
      description: Network to use (testnet, netna, local). Defaults to testnet.
    - name: DECIBEL_NODE_API_KEY
      description: Node API key for higher rate limits (from https://geomi.dev)
    - name: DECIBEL_GAS_STATION_API_KEY
      description: Gas station API key for sponsored gas fees (from https://geomi.dev). Optional if API wallet is funded with APT.
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

## How Accounts Work

The CLI uses **API wallets** to sign transactions on behalf of your Decibel subaccount. API wallets are created at [app.decibel.trade/api](https://app.decibel.trade/api). They allow programmatic trading without permitting deposits or withdrawals.

To manage funds (deposit/withdraw USDC), use the Decibel UI at [app.decibel.trade](https://app.decibel.trade).

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

### 3. Set Up an Account for Trading

1. Create an API wallet at [app.decibel.trade/api](https://app.decibel.trade/api)
2. Copy the API wallet private key and your subaccount address
3. Add an account to local storage (Recommended):

```bash
decibel-cli account add
# Follow the interactive prompts
```

Or set the environment variables:

```bash
export DECIBEL_PRIVATE_KEY=0x...your_api_wallet_private_key...
export DECIBEL_SUBACCOUNT_ADDRESS=0x...your_subaccount_address...
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
decibel-cli account info              # View balances
```

### Trading

```bash
# List markets first to see available symbols
decibel-cli markets ls

# Place limit order
decibel-cli trade order limit buy 0.01 BTC/USD 50000

# Place market order
decibel-cli trade order market buy 0.01 BTC/USD

# Cancel order
decibel-cli trade cancel <orderId> --market BTC/USD

# Set leverage
decibel-cli trade set-leverage BTC/USD 10
```

### Market Data

```bash
decibel-cli markets ls           # List all markets
decibel-cli markets price BTC/USD       # Get price
decibel-cli markets price BTC/USD -w    # Watch price
decibel-cli markets book BTC/USD        # Order book
decibel-cli markets book BTC/USD -w     # Watch order book
```

## Global Options

| Option              | Description                                |
| ------------------- | ------------------------------------------ |
| `--json`            | Output in JSON format (for scripting)      |
| `--network <name>`  | Use specific network (testnet/netna/local) |
| `--account <alias>` | Use specific account                       |
| `-h, --help`        | Show help                                  |

## MCP Server Mode

For AI agent integration, add the MCP server to Claude Code from the terminal:

```bash
claude mcp add --transport stdio \
  --env DECIBEL_PRIVATE_KEY=ed25519-priv-0x... \
  --env DECIBEL_SUBACCOUNT_ADDRESS=0x... \
  --env DECIBEL_NETWORK=testnet \
  --env DECIBEL_NODE_API_KEY=aptoslabs_... \
  -- decibel npx -y tsx /path/to/decibel-cli/src/mcp-server.ts
```

Replace the env var values and `/path/to/decibel-cli` with your own. You can omit `DECIBEL_PRIVATE_KEY` and `DECIBEL_SUBACCOUNT_ADDRESS` if you've added a default account with `decibel-cli account add`.

Alternatively, add to your Claude config file (`~/.claude/settings.json`):

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

Replace `/path/to/decibel-cli` with the actual path to your installation.

> **Note:** We use `tsx` because `@decibeltrade/sdk` has an ESM issue (missing `.js` extensions in compiled output). This will be fixed when the SDK updates to `moduleResolution: "NodeNext"`.

## Further Reading

See [reference.md](./reference.md) for complete command documentation and [examples.md](./examples.md) for workflow examples.

## Common Issues

1. **"No account configured"**: Run `decibel-cli account add` or set `DECIBEL_PRIVATE_KEY` and `DECIBEL_SUBACCOUNT_ADDRESS`
2. **"Insufficient balance"**: Deposit USDC through the Decibel UI at [app.decibel.trade](https://app.decibel.trade)
3. **Transaction failures**: Check that your API wallet has APT for gas fees, or set `DECIBEL_GAS_STATION_API_KEY`
