# Account Management Guide

Decibel CLI supports two methods for authentication: stored accounts and environment variables.

## When to Use Which

| Use Case | Method |
|----------|--------|
| **CLI daily trading** | Stored accounts (`account add`) |
| **Multiple accounts** | Stored accounts |
| **MCP server (Claude)** | Environment variable |
| **Scripts / CI** | Environment variable |
| **Quick one-off command** | Environment variable |

> **Note:** The MCP server only reads from environment variables, not from stored accounts. See [mcp.md](./mcp.md) for MCP setup.

## Method 1: Stored Accounts (Recommended)

Store accounts locally in an encrypted SQLite database at `~/.decibel/data.db`.

### Add an Account

```bash
decibel-cli account add
```

This launches an interactive wizard:

```
? Account type: (Use arrow keys)
❯ API Wallet (for trading)
  Read-only (for monitoring)

? Enter your private key: 0x...
? Account alias: main
? Set as default account? Yes

✓ Account "main" added successfully
```

### List Accounts

```bash
decibel-cli account ls
```

Output:
```
┌───────┬────────────────────┬─────────┐
│ Name  │ Address            │ Default │
├───────┼────────────────────┼─────────┤
│ main  │ 0x7c9dd8...31dfe9  │ ✓       │
│ bot   │ 0x45809d...cb08b8  │         │
└───────┴────────────────────┴─────────┘
```

### Set Default Account

```bash
decibel-cli account set-default bot
```

Or interactively:

```bash
decibel-cli account set-default
```

### Remove an Account

```bash
decibel-cli account remove main
```

Or interactively:

```bash
decibel-cli account remove
```

### Using a Specific Account

Override the default account for any command:

```bash
decibel-cli trade positions --account bot
decibel-cli funds balances --account main
```

## Method 2: Environment Variable

Set `DECIBEL_PRIVATE_KEY` for quick, temporary usage:

```bash
export DECIBEL_PRIVATE_KEY=0x...
decibel-cli trade positions
```

Or inline:

```bash
DECIBEL_PRIVATE_KEY=0x... decibel-cli funds balances
```

### Using a .env File

Create a `.env` file in your working directory:

```bash
# .env
DECIBEL_PRIVATE_KEY=0x1234567890abcdef...
DECIBEL_NETWORK=testnet
```

The CLI automatically loads this file.

## Priority Order

When multiple authentication methods are available, the CLI uses this priority:

1. **`--account` flag** - Highest priority
2. **`DECIBEL_PRIVATE_KEY` environment variable**
3. **Default stored account** - Lowest priority

## Account Types

### API Wallet (for trading)

- Full trading permissions
- Requires private key
- Can place orders, deposit, withdraw

### Read-only (for monitoring)

- View-only access
- Only requires wallet address
- Can view positions, balances, orders
- Cannot execute trades

## Getting Your Private Key

### From Petra Wallet

1. Open Petra wallet
2. Click the menu (three dots)
3. Select "Settings" > "Manage account"
4. Click "Show private key"
5. Enter your password
6. Copy the private key (starts with `0x`)

### From Aptos CLI

```bash
aptos key extract --private-key-file ~/.aptos/profiles/default/private_key.txt
```

## Encrypted Storage

For additional security, you can encrypt stored private keys with a password:

```bash
decibel-cli account add
# During the wizard, you'll be asked:
# ? Encrypt private key with password? Yes
# ? Enter password: ********
```

When using an encrypted account, you'll be prompted for the password:

```bash
decibel-cli trade positions --account encrypted-account
# ? Enter password for "encrypted-account": ********
```

## Account Info

View detailed account information:

```bash
decibel-cli account info
```

Output:
```
┌─────────────────────────┬─────────────────────────────────────────────────────────────────────┐
│ Property                │ Value                                                               │
├─────────────────────────┼─────────────────────────────────────────────────────────────────────┤
│ Address                 │ 0x45809dce39fdc59b8af81da9513b4fa4c3121fb2a1e1502e380ad24dbecb08b8  │
├─────────────────────────┼─────────────────────────────────────────────────────────────────────┤
│ Subaccount              │ 0xacb00e352ff4da752c1b4fc632d61efe5a2984f5807cbc3a29360406deb71715  │
├─────────────────────────┼─────────────────────────────────────────────────────────────────────┤
│ Wallet USDC             │ $0.00                                                               │
├─────────────────────────┼─────────────────────────────────────────────────────────────────────┤
│ Account Value           │ $986.48                                                             │
├─────────────────────────┼─────────────────────────────────────────────────────────────────────┤
│ Unrealized PnL          │ $0.00                                                               │
└─────────────────────────┴─────────────────────────────────────────────────────────────────────┘
```

## Multi-Account Workflows

### Trading Bot + Manual Trading

```bash
# Add bot account
decibel-cli account add
# alias: bot, set as default: no

# Add personal account
decibel-cli account add
# alias: personal, set as default: yes

# Bot operations
decibel-cli trade order market long 0.1 BTC/USD --account bot

# Personal trading (uses default)
decibel-cli trade order limit long 0.05 ETH/USD 2300
```

### Testnet vs Mainnet

```bash
# Add testnet account
DECIBEL_NETWORK=testnet decibel-cli account add
# alias: testnet-main

# Add mainnet account (when available)
DECIBEL_NETWORK=mainnet decibel-cli account add
# alias: mainnet-main

# Switch between networks
decibel-cli trade positions --network testnet --account testnet-main
decibel-cli trade positions --network mainnet --account mainnet-main
```

## Security Best Practices

1. **Use stored accounts** instead of environment variables for persistent setups
2. **Enable encryption** for stored private keys
3. **Use dedicated trading wallets** with limited funds
4. **Never share private keys** or commit them to version control
5. **Start on testnet** before trading with real funds

## Storage Location

Account data is stored at:

- **macOS/Linux:** `~/.decibel/data.db`
- **Windows:** `%USERPROFILE%\.decibel\data.db`

To reset all accounts:

```bash
rm ~/.decibel/data.db
```
