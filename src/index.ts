#!/usr/bin/env node
/**
 * Decibel CLI - Command-line interface for trading on Decibel DEX
 *
 * This CLI provides:
 * - Trading commands (orders, positions, leverage)
 * - Account management (add/remove accounts, view balances)
 * - Market data (prices, orderbook, market list)
 * - Fund management (deposits, withdrawals)
 *
 * Designed for both AI agents (via --json flag) and human power users.
 *
 * Usage:
 *   decibel-cli --help                      # Show all commands
 *   decibel-cli markets ls --json           # List markets (JSON output)
 *   decibel-cli trade order limit buy 0.01 BTC-PERP 50000
 */

import { Command } from "commander";
import { config } from "dotenv";

// Load environment variables from .env file
config();

// Import command modules
import { createAccountCommand } from "./commands/account/index.js";
import { createMarketsCommand } from "./commands/markets/index.js";
import { createTradeCommand } from "./commands/trade/index.js";

// Create the main program
const program = new Command();

program
  .name("decibel-cli")
  .description("Command-line interface for trading on Decibel DEX")
  .version("1.0.0")
  .option("--network <network>", "Network to use (testnet, netna, local)", "testnet");

// Add command groups
program.addCommand(createAccountCommand());
program.addCommand(createMarketsCommand());
program.addCommand(createTradeCommand());

// Global error handler for unhandled promise rejections
process.on("unhandledRejection", (reason) => {
  console.error("Error:", reason instanceof Error ? reason.message : String(reason));
  process.exit(1);
});

// Parse and execute
program.parse();
