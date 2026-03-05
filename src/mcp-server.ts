#!/usr/bin/env node
/**
 * MCP Server Entry Point
 *
 * This file is the entry point for running decibel-cli as an MCP server.
 * It's designed to be invoked by AI assistants like Claude.
 *
 * Usage:
 *   npx tsx dist/mcp-server.js
 *
 * Note: Use tsx instead of node due to @decibeltrade/sdk ESM compatibility
 * issue (missing .js extensions in compiled output).
 *
 * Environment variables (in priority order):
 *   DECIBEL_PRIVATE_KEY - Private key for trading (highest priority)
 *   DECIBEL_ACCOUNT - Account alias from stored accounts
 *   (none) - Falls back to default stored account
 *   DECIBEL_NETWORK - Network (testnet, netna, local)
 */

import { config } from "dotenv";

import { runMcpServer } from "./mcp/server.js";
import {
  getEnvAccountAlias,
  getEnvGasStationApiKey,
  getEnvNetwork,
  getEnvNodeApiKey,
  getEnvPrivateKey,
  getEnvSubaccountAddress,
} from "./utils/config.js";

// Load environment variables
config();

// Run the MCP server
// Account resolution priority:
// 1. DECIBEL_PRIVATE_KEY env var (if set)
// 2. DECIBEL_ACCOUNT env var -> stored account by alias
// 3. Default stored account (from `decibel-cli account add`)
runMcpServer({
  network: getEnvNetwork(),
  accountAlias: getEnvAccountAlias(),
  subaccountAddress: getEnvSubaccountAddress(),
  privateKey: getEnvPrivateKey(),
  nodeApiKey: getEnvNodeApiKey(),
  gasStationApiKey: getEnvGasStationApiKey(),
}).catch((error: unknown) => {
  console.error("MCP server error:", error);
  process.exit(1);
});
