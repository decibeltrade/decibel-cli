# Account Management Guide

Decibel CLI supports two methods for authentication: stored accounts and environment variables.

## How Accounts Work

Decibel CLI uses **API wallets** to sign transactions on behalf of your Decibel subaccount. API wallets are created through the Decibel UI at [app.decibel.trade/api](https://app.decibel.trade/api). They allow you to perform automated or programmatic trading actions without permitting deposits or withdrawals.

Each account in the CLI consists of:

- A **subaccount address** - the Decibel subaccount you're trading on
- An **API wallet private key** (optional) - for signing transactions

## When to Use Which

| Use Case                  | Recommended Method                     |
| ------------------------- | -------------------------------------- |
| **CLI daily trading**     | Stored accounts                        |
| **Multiple accounts**     | Stored accounts                        |
| **MCP server (Claude)**   | Stored accounts (no secrets in config) |
| **Scripts / CI**          | Environment variable                   |
| **Quick one-off command** | Environment variable                   |

> **Tip:** For MCP, stored accounts are recommended because you don't need to put your private key in the Claude config file. See [mcp.md](./mcp.md) for MCP setup.

## Method 1: Stored Accounts (Recommended)

Store accounts locally in an encrypted SQLite database at `~/.decibel/data.db`.

### Add an Account

```bash
decibel-cli account add
```

This launches an interactive wizard:

```
? Account type: (Use arrow keys)
> API Wallet (for trading)
  Read-only (for monitoring)

? Subaccount address (hex string starting with 0x): 0x...
? Enter your API wallet private key: 0x...
? Account alias: main
? Set as default account? Yes

> Account "main" added successfully
```

### List Accounts

```bash
decibel-cli account ls
```

Output:

```
+-------+--------------------+-----------+---------+
| Name  | Address            | Type      | Default |
+-------+--------------------+-----------+---------+
| main  | 0x7c9dd8...31dfe9  | api-wallet| *       |
| bot   | 0x45809d...cb08b8  | api-wallet|         |
+-------+--------------------+-----------+---------+
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
decibel-cli account info --account main
```

## Method 2: Environment Variable

Set `DECIBEL_PRIVATE_KEY` and `DECIBEL_SUBACCOUNT_ADDRESS` for quick, temporary usage:

```bash
export DECIBEL_PRIVATE_KEY=0x...
export DECIBEL_SUBACCOUNT_ADDRESS=0x...
decibel-cli trade positions
```

Or inline:

```bash
DECIBEL_PRIVATE_KEY=0x... DECIBEL_SUBACCOUNT_ADDRESS=0x... decibel-cli trade positions
```

### Using a .env File

Create a `.env` file in your working directory:

```bash
# .env
DECIBEL_PRIVATE_KEY=0x1234567890abcdef...
DECIBEL_SUBACCOUNT_ADDRESS=0xabcdef1234567890...
DECIBEL_NETWORK=testnet
DECIBEL_NODE_API_KEY=your-node-api-key
```

The CLI automatically loads this file.

## Priority Order

When multiple authentication methods are available, the CLI uses this priority:

### For transactions (signing required):

1. **`--account` flag** - Highest priority
2. **`DECIBEL_PRIVATE_KEY` environment variable**
3. **`DECIBEL_ACCOUNT_ALIAS` environment variable** - Stored account by alias
4. **Default stored account** - Lowest priority

### For read-only operations:

1. **`--account` flag** - Highest priority
2. **`DECIBEL_SUBACCOUNT_ADDRESS` environment variable**
3. **`DECIBEL_ACCOUNT_ALIAS` environment variable** - Stored account by alias
4. **Default stored account** - Lowest priority

## Account Types

### API Wallet (for trading)

- Full trading permissions (place orders, cancel orders, set leverage)
- Requires API wallet private key and subaccount address
- Cannot deposit or withdraw funds (use the Decibel UI for that)

### Read-only (for monitoring)

- View-only access
- Only requires subaccount address
- Can view positions, balances, orders
- Cannot execute trades

## Creating an API Wallet

1. Visit [app.decibel.trade/api](https://app.decibel.trade/api)
2. Connect your wallet
3. Create a new API wallet for your subaccount
4. Copy the API wallet private key (starts with `0x`)
5. Note your subaccount address

API wallets allow you to perform automated or programmatic actions on behalf of a subaccount without allowing deposits or withdrawals.

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
+-------------------------+-------------------------------------------------------------------+
| Property                | Value                                                             |
+-------------------------+-------------------------------------------------------------------+
| Subaccount Address      | 0x45809dce39fdc59b8af81da9513b4fa4c3121fb2a1e1502e380ad24dbecb08b8|
+-------------------------+-------------------------------------------------------------------+
| Account Value           | $986.48                                                           |
+-------------------------+-------------------------------------------------------------------+
| Unrealized PnL          | $0.00                                                             |
+-------------------------+-------------------------------------------------------------------+
| Withdrawable (Cross)    | $982.67                                                           |
+-------------------------+-------------------------------------------------------------------+
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
3. **Use API wallets** instead of your main wallet for trading
4. **Never share private keys** or commit them to version control
5. **Start on testnet** before trading with real funds

## Gas Fees

API wallets need APT to pay for gas fees on the Aptos blockchain. You have two options:

1. **Fund your API wallet with APT** - Send APT directly to your API wallet address
2. **Use a gas station API key** - Get a gas station API key from [geomi.dev](https://geomi.dev) to sponsor gas fees. Set the `DECIBEL_GAS_STATION_API_KEY` environment variable.

## Storage Location

Account data is stored at:

- **macOS/Linux:** `~/.decibel/data.db`
- **Windows:** `%USERPROFILE%\.decibel\data.db`

To reset all accounts:

```bash
rm ~/.decibel/data.db
```
