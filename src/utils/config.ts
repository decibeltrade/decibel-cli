import { homedir } from "os";
import { join } from "path";

import {
  DecibelConfig,
  NETNA_CONFIG,
  TESTNET_CONFIG,
  LOCAL_CONFIG,
} from "@decibeltrade/sdk";

// Data directory paths
export const DECIBEL_DIR = join(homedir(), ".decibel");
export const DATABASE_PATH = join(DECIBEL_DIR, "data.db");
export const SERVER_PID_PATH = join(DECIBEL_DIR, "server.pid");
export const SERVER_PORT_PATH = join(DECIBEL_DIR, "server.port");

// Default configuration
export const DEFAULT_NETWORK = "testnet";

export type NetworkName = "testnet" | "netna" | "local";

// Network configurations
export const NETWORK_CONFIGS: Record<NetworkName, DecibelConfig> = {
  testnet: TESTNET_CONFIG,
  netna: NETNA_CONFIG,
  local: LOCAL_CONFIG,
};

export function getNetworkConfig(network: string): DecibelConfig {
  const config = NETWORK_CONFIGS[network as NetworkName];
  if (!config) {
    throw new Error(
      `Unknown network: ${network}. Valid networks: ${Object.keys(NETWORK_CONFIGS).join(", ")}`
    );
  }
  return config;
}

export function getEnvNetwork(): NetworkName {
  const network = process.env.DECIBEL_NETWORK;
  if (network && network in NETWORK_CONFIGS) {
    return network as NetworkName;
  }
  return DEFAULT_NETWORK as NetworkName;
}

export function getEnvPrivateKey(): string | undefined {
  return process.env.DECIBEL_PRIVATE_KEY;
}

export function getEnvNodeApiKey(): string | undefined {
  return process.env.DECIBEL_NODE_API_KEY;
}

export function getEnvGasStationApiKey(): string | undefined {
  return process.env.DECIBEL_GAS_STATION_API_KEY;
}
