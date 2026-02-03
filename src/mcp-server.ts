#!/usr/bin/env node
/**
 * MCP Server Entry Point
 *
 * This file is the entry point for running decibel-cli as an MCP server.
 * It's designed to be invoked by AI assistants like Claude.
 *
 * Usage:
 *   node dist/mcp-server.js
 *   decibel-cli mcp-server
 *
 * Environment variables:
 *   DECIBEL_PRIVATE_KEY - Private key for trading
 *   DECIBEL_NETWORK - Network (testnet, netna, local)
 */

import { config } from "dotenv";
import { runMcpServer } from "./mcp/server.js";
import { getEnvNetwork } from "./utils/config.js";

// Load environment variables
config();

// Run the MCP server
runMcpServer({
  network: getEnvNetwork(),
}).catch((error) => {
  console.error("MCP server error:", error);
  process.exit(1);
});
