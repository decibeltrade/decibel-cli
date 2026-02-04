# MCP Server Setup Guide

Connect Decibel CLI to AI assistants like Claude using the Model Context Protocol (MCP).

## What is MCP?

MCP (Model Context Protocol) allows AI assistants to interact with external tools and services. By running Decibel CLI as an MCP server, Claude can execute trades, check positions, and manage your account through natural language.

## Quick Setup

### 1. Install Decibel CLI

```bash
npm install -g decibel-cli
```

Or clone and build from source:

```bash
git clone git@github.com:decibeltrade/decibel-cli.git
cd decibel-cli
npm install
npm run build
```

### 2. Configure Claude Desktop

Add the following to your Claude Desktop configuration file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "decibel": {
      "command": "npx",
      "args": ["tsx", "/path/to/decibel-cli/src/mcp-server.ts"],
      "env": {
        "DECIBEL_PRIVATE_KEY": "0x...",
        "DECIBEL_NETWORK": "testnet"
      }
    }
  }
}
```

**If installed globally:**

```json
{
  "mcpServers": {
    "decibel": {
      "command": "decibel-cli-mcp",
      "env": {
        "DECIBEL_PRIVATE_KEY": "0x...",
        "DECIBEL_NETWORK": "testnet"
      }
    }
  }
}
```

### 3. Restart Claude Desktop

After saving the configuration, restart Claude Desktop to load the MCP server.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DECIBEL_PRIVATE_KEY` | Yes | Your trading wallet private key (starts with `0x`) |
| `DECIBEL_NETWORK` | No | Network to use: `testnet` (default), `netna`, or `local` |

## Available MCP Tools

Once connected, Claude has access to these tools:

### Trading Tools

| Tool | Description |
|------|-------------|
| `place_limit_order` | Place a limit order (buy/sell/long/short) |
| `place_market_order` | Place a market order with slippage tolerance |
| `cancel_order` | Cancel an open order by ID |
| `set_leverage` | Set leverage for a market (1-50x) |
| `get_positions` | Get all open positions |
| `get_orders` | Get all open orders |

### Market Data Tools

| Tool | Description |
|------|-------------|
| `get_markets` | List all available markets |
| `get_price` | Get current price, funding rate, open interest |
| `get_orderbook` | Get order book with bids and asks |

### Account Tools

| Tool | Description |
|------|-------------|
| `get_balances` | Get wallet and trading account balances |
| `deposit` | Deposit USDC to trading account |
| `withdraw` | Withdraw USDC from trading account |

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

1. Verify the path to `decibel-cli` is correct
2. Check that `DECIBEL_PRIVATE_KEY` is set
3. Restart Claude Desktop after config changes

### Permission denied

Make sure the MCP server script is executable:

```bash
chmod +x /path/to/decibel-cli/src/mcp-server.ts
```

### Testing the server manually

You can test the MCP server independently:

```bash
# Set environment variables
export DECIBEL_PRIVATE_KEY=0x...
export DECIBEL_NETWORK=testnet

# Run the server
npx tsx src/mcp-server.ts
```

The server communicates via stdio, so you'll see it waiting for input.

## Security Notes

- **Never commit your private key** to version control
- Use a dedicated trading wallet with limited funds
- Consider using testnet first to verify the setup
- The MCP server has full trading permissions for the configured wallet

## Alternative: Using .env File

Instead of putting credentials in the Claude config, you can use a `.env` file:

1. Create `.env` in the decibel-cli directory:

```bash
DECIBEL_PRIVATE_KEY=0x...
DECIBEL_NETWORK=testnet
```

2. Update Claude config to not include env vars:

```json
{
  "mcpServers": {
    "decibel": {
      "command": "npx",
      "args": ["tsx", "/path/to/decibel-cli/src/mcp-server.ts"],
      "cwd": "/path/to/decibel-cli"
    }
  }
}
```

The server will load the `.env` file automatically when started from that directory.
