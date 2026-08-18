# Decibel CLI Examples

Workflow examples for common trading scenarios.

## Initial Setup

### Installing the CLI

```bash
# Check if already installed
which decibel-cli

# Install globally
npm install -g decibel-cli

# Verify installation
decibel-cli --version
decibel-cli --help
```

### Creating an API Wallet

1. Visit [app.decibel.trade/api](https://app.decibel.trade/api)
2. Connect your wallet
3. Create a subaccount (or use an existing one)
4. Create an API wallet for your subaccount
5. Copy the API wallet private key and subaccount address

### Adding Your First Account

```bash
# Interactive account setup
decibel-cli account add

# You'll be prompted for:
# 1. Account type (API wallet for trading, read-only for monitoring)
# 2. Subaccount address
# 3. API wallet private key (for api-wallet type)
# 4. Alias (e.g., "main", "trading", "bot")
# 5. Whether to set as default

# Verify the account was added
decibel-cli account ls
```

### Checking Your Balance

```bash
# Check account info (balances, equity)
decibel-cli account info

# If you need to deposit USDC, use the Decibel UI:
# Visit https://app.decibel.trade to deposit funds
```

---

## Basic Trading Workflow

### 1. Check Available Markets

```bash
# List all markets to find symbols and max leverage
decibel-cli markets ls
```

### 2. Check Current Price

```bash
# Get BTC price
decibel-cli markets price BTC/USD

# Watch price in real-time
decibel-cli markets price BTC/USD -w
```

### 3. Set Leverage (Optional)

```bash
# Set 10x leverage for BTC
decibel-cli trade set-leverage BTC/USD 10

# Use isolated margin instead
decibel-cli trade set-leverage BTC/USD 5 --isolated
```

### 4. Place an Order

```bash
# Limit order: buy 0.01 BTC at $50,000
decibel-cli trade order limit buy 0.01 BTC/USD 50000

# Market order: buy 0.01 BTC at current price
decibel-cli trade order market buy 0.01 BTC/USD

# Check order was placed
decibel-cli trade orders
```

### 5. Monitor Your Position

```bash
# View positions
decibel-cli trade positions

# Watch positions in real-time
decibel-cli trade positions -w
```

### 6. Close Position

```bash
# Close full position with one command
decibel-cli trade close BTC/USD

# Partial close
decibel-cli trade close BTC/USD --size 0.005

# Or manually with market/limit orders
decibel-cli trade order market sell 0.01 BTC/USD
decibel-cli trade order limit sell 0.01 BTC/USD 55000
```

---

## Opening a Long Position

```bash
# 1. Check current price
decibel-cli markets price BTC/USD

# 2. Set leverage
decibel-cli trade set-leverage BTC/USD 10

# 3. Place limit long order slightly below market
decibel-cli trade order limit long 0.01 BTC/USD 49500

# 4. Set TP/SL for protection
decibel-cli trade tp-sl set BTC/USD --tp-trigger 55000 --tp-limit 54500 --sl-trigger 47000 --sl-limit 46500

# 5. Check order status and TP/SL
decibel-cli trade orders
decibel-cli trade tp-sl ls BTC/USD

# 6. Watch position once filled
decibel-cli trade positions -w

# 7. Close when ready
decibel-cli trade close BTC/USD
```

---

## Opening a Short Position

```bash
# 1. Check current price
decibel-cli markets price ETH/USD

# 2. Open short position
decibel-cli trade order market short 0.1 ETH/USD

# 3. Set stop-loss protection
decibel-cli trade tp-sl set ETH/USD --sl-trigger 4000 --sl-limit 4050

# 4. Monitor position
decibel-cli trade positions -w

# 5. Close short
decibel-cli trade close ETH/USD
```

---

## TWAP Order Workflow

```bash
# Buy 1 BTC over 1 hour, executing every minute
decibel-cli trade order twap buy 1 BTC/USD --duration 3600 --frequency 60

# Check active TWAPs
decibel-cli trade active-twaps

# Cancel a TWAP if needed
decibel-cli trade cancel-twap <orderId> --market BTC/USD

# View TWAP history
decibel-cli trade twap-history
```

---

## Stop Orders

```bash
# Stop-loss: sell if BTC drops to 60000, execute at 59000
decibel-cli trade order stop-limit sell 0.01 BTC/USD 59000 60000

# Stop market: sell immediately if BTC drops to 60000
decibel-cli trade order stop-market sell 0.01 BTC/USD 60000 --reduce-only

# Breakout entry: buy if BTC breaks above 70000
decibel-cli trade order stop-market buy 0.01 BTC/USD 70000
```

---

## Margin Management

```bash
# Switch to isolated margin for ETH
decibel-cli trade set-margin ETH/USD isolated

# Set leverage
decibel-cli trade set-leverage ETH/USD 5

# Switch back to cross margin
decibel-cli trade set-margin ETH/USD cross
```

---

## Scalping Workflow

```bash
# 1. Watch the order book in one terminal
decibel-cli markets book BTC/USD -w

# 2. In another terminal, place quick orders
decibel-cli trade order limit long 0.001 BTC/USD 49950
decibel-cli trade order limit short 0.001 BTC/USD 50050

# 3. Cancel if price moves away
decibel-cli trade cancel-all --market BTC/USD -y
```

---

## Multi-Account Setup

### Managing Multiple Accounts

```bash
# Add trading account
decibel-cli account add
# Enter subaccount address, API wallet private key, set alias "trading"

# Add monitoring-only account
decibel-cli account add
# Choose read-only, enter subaccount address, set alias "whale-watch"

# List all accounts
decibel-cli account ls
# Output:
# Alias        Address         Type        Default
# trading      0x1234...abcd   api-wallet  *
# whale-watch  0xabcd...1234   read-only

# Switch default account
decibel-cli account set-default whale-watch

# Trade from specific account
decibel-cli trade order limit buy 0.01 BTC/USD 50000 --account trading
```

---

## Real-Time Monitoring

### Position Dashboard

```bash
# Terminal 1: Watch positions
decibel-cli trade positions -w

# Terminal 2: Watch orders
decibel-cli trade orders -w

# Terminal 3: Watch BTC price
decibel-cli markets price BTC/USD -w
```

### Order Book Analysis

```bash
# Watch ETH order book with 20 levels
decibel-cli markets book ETH/USD -w --depth 20

# The display shows:
# - Top bid/ask levels
# - Cumulative depth bars
# - Current spread
# - Updates in real-time
```

---

## Automated Trading Scripts

### Price Alert Script

```bash
#!/bin/bash
# price-alert.sh - Alert when BTC crosses threshold

TARGET=55000

while true; do
  PRICE=$(decibel-cli markets price BTC/USD --json | jq -r '.markPrice')

  if (( $(echo "$PRICE > $TARGET" | bc -l) )); then
    echo "ALERT: BTC above $TARGET at $PRICE"
    # Add notification command here
  fi

  sleep 5
done
```

### Automated Order Placement

```bash
#!/bin/bash
# place-order.sh - Place order with logging

SYMBOL="BTC/USD"
SIDE="buy"
SIZE="0.001"
PRICE="50000"

echo "$(date): Placing $SIDE $SIZE $SYMBOL @ $PRICE"

RESULT=$(decibel-cli trade order limit $SIDE $SIZE $SYMBOL $PRICE --json)
SUCCESS=$(echo $RESULT | jq -r '.success')
ORDER_ID=$(echo $RESULT | jq -r '.orderId // empty')

if [ "$SUCCESS" = "true" ]; then
  echo "$(date): Order placed successfully - ID: $ORDER_ID"
else
  echo "$(date): Order failed"
  echo $RESULT | jq .
fi
```

### Portfolio Snapshot

```bash
#!/bin/bash
# snapshot.sh - Save portfolio snapshot to file

DATE=$(date +%Y%m%d_%H%M%S)
OUTDIR="./snapshots"
mkdir -p $OUTDIR

echo "Taking portfolio snapshot..."

decibel-cli trade positions --json > "$OUTDIR/positions_$DATE.json"
decibel-cli trade orders --json > "$OUTDIR/orders_$DATE.json"
decibel-cli account info --json > "$OUTDIR/balances_$DATE.json"

echo "Snapshot saved to $OUTDIR/"
```

### Multi-Asset Price Tracker

```bash
#!/bin/bash
# track-prices.sh - Track multiple assets

ASSETS="BTC/USD ETH/USD SOL/USD"

echo "Asset Prices - $(date)"
echo "========================"

for ASSET in $ASSETS; do
  PRICE=$(decibel-cli markets price $ASSET --json 2>/dev/null | jq -r '.markPrice // "N/A"')
  printf "%-12s: %s\n" "$ASSET" "$PRICE"
done
```

---

## JSON Output for Integration

### Getting Structured Data

```bash
# Get all markets as JSON
decibel-cli markets ls --json | jq '.[] | {name, maxLeverage}'

# Get specific position data
decibel-cli trade positions --json | jq '.[] | select(.market_name == "BTC/USD")'

# Get open orders for a market
decibel-cli trade orders --json | jq '.[] | select(.market_name == "ETH/USD")'

# Extract account value
decibel-cli account info --json | jq '.perp_equity_balance'
```

### Piping to Other Tools

```bash
# Export positions to CSV
decibel-cli trade positions --json | jq -r '.[] | [.market_name, .size, .entry_price, .unrealized_pnl] | @csv'

# Log to file with timestamp
echo "{\"timestamp\": \"$(date -Iseconds)\", \"data\": $(decibel-cli trade positions --json)}" >> positions.log
```

---

## Troubleshooting

### Account Issues

```bash
# List accounts to verify setup
decibel-cli account ls

# If no default, set one
decibel-cli account set-default main

# If key issues, remove and re-add
decibel-cli account remove bad-account
decibel-cli account add
```

### Connection Issues

```bash
# Test connection with simple query
decibel-cli markets ls

# Try different network
decibel-cli markets ls --network local
```

### Order Issues

```bash
# Check if order exists
decibel-cli trade orders --json

# Check position state
decibel-cli trade positions --json

# View trade history for fills
decibel-cli trade history --limit 10
```
