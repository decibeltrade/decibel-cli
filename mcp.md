# MCP Server Setup Guide

Connect Decibel CLI to AI assistants like Claude using the Model Context Protocol (MCP).

## What is MCP?

MCP (Model Context Protocol) allows AI assistants to interact with external tools and services. By running Decibel CLI as an MCP server, Claude can execute trades, check positions, and manage your account through natural language.

## How It Works

The MCP server uses **API wallets** to sign transactions on behalf of your Decibel subaccount. API wallets can be created at [app.decibel.trade/api](https://app.decibel.trade/api). They allow programmatic trading actions without permitting deposits or withdrawals.

## Authentication Options

The MCP server supports two authentication methods:

1. **Stored Accounts (Recommended)** - Use accounts saved with `decibel-cli account add`
2. **Environment Variables** - Pass API wallet private key and subaccount address directly in MCP config

## Quick Setup

### 1. Install Decibel CLI

```bash
npm install -g @decibeltrade/cli
```

### 2. Add Your Account (Recommended Method)

```bash
decibel-cli account add
# Follow the interactive prompts:
# - Enter your subaccount address
# - Enter your API wallet private key
# - Set an alias (e.g., "main")
# - Set as default account
```

### 3. Configure Your Claude Client

Choose your client:

- [Claude Code](#claude-code-setup)
- [Claude Desktop](#claude-desktop-setup)

---

## Claude Code Setup

There are two ways to add the MCP server to Claude Code: using the `claude mcp add` CLI command (recommended), or manually editing `~/.claude/settings.json`.

### Option A: Using the CLI (Recommended)

Run `claude mcp add` from your terminal to register the server in one command:

```bash
claude mcp add --transport stdio \
  --env DECIBEL_PRIVATE_KEY=ed25519-priv-0x... \
  --env DECIBEL_SUBACCOUNT_ADDRESS=0x... \
  --env DECIBEL_NETWORK=testnet \
  --env DECIBEL_NODE_API_KEY=aptoslabs_... \
  -- decibel npx -y --package @decibeltrade/cli decibel-mcp
```

Replace the env var values with your own. You can omit `DECIBEL_PRIVATE_KEY` and `DECIBEL_SUBACCOUNT_ADDRESS` if you've already added a default account with `decibel-cli account add`.

To verify the server was added:

```bash
claude mcp list
```

### Option B: Manual JSON Configuration

Claude Code reads MCP configuration from `~/.claude/settings.json`.

#### Using Stored Account (Recommended)

```json
{
  "mcpServers": {
    "decibel": {
      "command": "npx",
      "args": ["-y", "--package", "@decibeltrade/cli", "decibel-mcp"],
      "env": {
        "DECIBEL_NETWORK": "testnet",
        "DECIBEL_NODE_API_KEY": "your-node-api-key"
      }
    }
  }
}
```

#### Using a Specific Account

```json
{
  "mcpServers": {
    "decibel": {
      "command": "npx",
      "args": ["-y", "--package", "@decibeltrade/cli", "decibel-mcp"],
      "env": {
        "DECIBEL_ACCOUNT_ALIAS": "trading-bot",
        "DECIBEL_NETWORK": "testnet",
        "DECIBEL_NODE_API_KEY": "your-node-api-key"
      }
    }
  }
}
```

#### Using Environment Variables Directly

```json
{
  "mcpServers": {
    "decibel": {
      "command": "npx",
      "args": ["-y", "--package", "@decibeltrade/cli", "decibel-mcp"],
      "env": {
        "DECIBEL_PRIVATE_KEY": "0x...",
        "DECIBEL_SUBACCOUNT_ADDRESS": "0x...",
        "DECIBEL_NETWORK": "testnet",
        "DECIBEL_NODE_API_KEY": "your-node-api-key"
      }
    }
  }
}
```

After saving, restart Claude Code or run `/mcp` to reload servers.

---

## Claude Desktop Setup

**Config location:**

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

### Using Stored Account (Recommended)

```json
{
  "mcpServers": {
    "decibel": {
      "command": "npx",
      "args": ["-y", "--package", "@decibeltrade/cli", "decibel-mcp"],
      "env": {
        "DECIBEL_NETWORK": "testnet",
        "DECIBEL_NODE_API_KEY": "your-node-api-key"
      }
    }
  }
}
```

### Using a Specific Account

```json
{
  "mcpServers": {
    "decibel": {
      "command": "npx",
      "args": ["-y", "--package", "@decibeltrade/cli", "decibel-mcp"],
      "env": {
        "DECIBEL_ACCOUNT_ALIAS": "trading-bot",
        "DECIBEL_NETWORK": "testnet",
        "DECIBEL_NODE_API_KEY": "your-node-api-key"
      }
    }
  }
}
```

### Using Environment Variables Directly

```json
{
  "mcpServers": {
    "decibel": {
      "command": "npx",
      "args": ["-y", "--package", "@decibeltrade/cli", "decibel-mcp"],
      "env": {
        "DECIBEL_PRIVATE_KEY": "0x...",
        "DECIBEL_SUBACCOUNT_ADDRESS": "0x...",
        "DECIBEL_NETWORK": "testnet",
        "DECIBEL_NODE_API_KEY": "your-node-api-key"
      }
    }
  }
}
```

After saving, restart Claude Desktop to load the MCP server.

## Environment Variables

| Variable                      | Required | Description                                                                          |
| ----------------------------- | -------- | ------------------------------------------------------------------------------------ |
| `DECIBEL_PRIVATE_KEY`         | No\*     | API wallet private key (highest priority)                                            |
| `DECIBEL_SUBACCOUNT_ADDRESS`  | No\*     | Subaccount address for trading                                                       |
| `DECIBEL_ACCOUNT_ALIAS`       | No\*     | Account alias from stored accounts                                                   |
| `DECIBEL_NETWORK`             | No       | Network: `mainnet`, `testnet` (default), `netna`, `local`                            |
| `DECIBEL_NODE_API_KEY`        | No       | Node API key for higher rate limits (from [geomi.dev](https://geomi.dev))            |
| `DECIBEL_GAS_STATION_API_KEY` | No       | Gas station API key for sponsored transactions (from [geomi.dev](https://geomi.dev)) |

\*At least one of `DECIBEL_PRIVATE_KEY` + `DECIBEL_SUBACCOUNT_ADDRESS`, `DECIBEL_ACCOUNT_ALIAS`, or a default stored account is required.

### Authentication Priority

1. `DECIBEL_PRIVATE_KEY` environment variable (if set)
2. `DECIBEL_ACCOUNT_ALIAS` environment variable -> looks up stored account
3. Default stored account (set with `decibel-cli account set-default`)

## Available MCP Tools

Once connected, Claude has access to these tools:

### Trading Tools

| Tool                      | Description                                  |
| ------------------------- | -------------------------------------------- |
| `place_limit_order`       | Place a limit order (buy/sell/long/short)    |
| `place_market_order`      | Place a market order with slippage tolerance |
| `place_stop_limit_order`  | Place a stop limit order                     |
| `place_stop_market_order` | Place a stop market order                    |
| `place_twap_order`        | Place a TWAP order (time-weighted execution) |
| `close_position`          | Close an open position                       |
| `cancel_order`            | Cancel an open order by ID                   |
| `cancel_all_orders`       | Cancel all open orders                       |
| `cancel_twap_order`       | Cancel a TWAP order                          |
| `place_tp_sl`             | Set TP/SL for a position                     |
| `cancel_tp_sl`            | Cancel a TP/SL order                         |
| `set_leverage`            | Set leverage for a market (1-50x)            |
| `set_margin_type`         | Switch cross/isolated margin                 |

### Read Tools

| Tool                  | Description                      |
| --------------------- | -------------------------------- |
| `get_positions`       | Get all open positions           |
| `get_orders`          | Get all open orders              |
| `get_tp_sl`           | Get TP/SL orders for a position  |
| `get_active_twaps`    | Get active TWAP orders           |
| `get_trade_history`   | Get trade fill history           |
| `get_order_history`   | Get order history (all states)   |
| `get_twap_history`    | Get TWAP order history           |
| `get_funding_history` | Get funding rate payment history |

### Market Data Tools

| Tool            | Description                                    |
| --------------- | ---------------------------------------------- |
| `get_markets`   | List all available markets                     |
| `get_price`     | Get current price, funding rate, open interest |
| `get_orderbook` | Get order book snapshot                        |

### Account Tools

| Tool           | Description                                  |
| -------------- | -------------------------------------------- |
| `get_balances` | Get trading account balances and margin info |

## Example Conversations

Once configured, you can interact with Decibel naturally:

**Check balances:**

> "What's my current balance on Decibel?"

**Get market data:**

> "Show me the BTC price and orderbook"

**Place trades:**

> "Go long 0.1 BTC at $75,000"

**Manage positions:**

> "What positions do I have open? Close the ETH position."

**Set leverage:**

> "Set my BTC leverage to 10x"

## Troubleshooting

### Server not connecting

1. Verify `@decibeltrade/cli` is installed (`npm ls -g @decibeltrade/cli`)
2. Check that authentication is configured (stored account or env vars)
3. Restart Claude Desktop after config changes

### Testing the server manually

You can test the MCP server independently:

```bash
# Set environment variables
export DECIBEL_PRIVATE_KEY=ed25519-priv-0x...
export DECIBEL_SUBACCOUNT_ADDRESS=0x...
export DECIBEL_NETWORK=testnet

# Run the server
decibel-mcp
```

The server communicates via stdio, so you'll see it waiting for input.

## Security Notes

- **Never commit your private key** to version control
- Use API wallets (not your main wallet) for programmatic trading
- API wallets cannot deposit or withdraw funds, limiting risk
- Consider using testnet first to verify the setup
- The MCP server has trading permissions only (no deposits/withdrawals)

## Gas Fees

API wallets need APT to pay for gas fees. You have two options:

1. **Fund your API wallet with APT** - Send APT to your API wallet address
2. **Use a gas station API key** - Get one from [geomi.dev](https://geomi.dev) and set `DECIBEL_GAS_STATION_API_KEY`

## Alternative: Using .env File

Instead of putting credentials in the Claude config, you can use a `.env` file:

1. Create `.env` in the decibel-cli directory:

```bash
DECIBEL_PRIVATE_KEY=0x...
DECIBEL_SUBACCOUNT_ADDRESS=0x...
DECIBEL_NETWORK=testnet
DECIBEL_NODE_API_KEY=your-node-api-key
```

2. Update Claude config to not include env vars:

```json
{
  "mcpServers": {
    "decibel": {
      "command": "npx",
      "args": ["-y", "-p", "@decibeltrade/cli", "decibel-mcp"]
    }
  }
}
```

The server will load the `.env` file automatically.
