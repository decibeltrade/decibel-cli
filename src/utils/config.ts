import { DecibelConfig, LOCAL_CONFIG, MAINNET_CONFIG, TESTNET_CONFIG } from "@decibeltrade/sdk";
import { homedir } from "os";
import { join } from "path";

// Data directory paths
export const DECIBEL_DIR = join(homedir(), ".decibel");
export const DATABASE_PATH = join(DECIBEL_DIR, "data.db");
export const SERVER_PID_PATH = join(DECIBEL_DIR, "server.pid");
export const SERVER_PORT_PATH = join(DECIBEL_DIR, "server.port");

// Default configuration
export const DEFAULT_NETWORK = "testnet";

export type NetworkName = "mainnet" | "testnet" | "local";

// Network configurations
export const NETWORK_CONFIGS: Record<NetworkName, DecibelConfig> = {
  mainnet: MAINNET_CONFIG,
  testnet: TESTNET_CONFIG,
  local: LOCAL_CONFIG,
};

export function getNetworkConfig(network: NetworkName): DecibelConfig {
  const config = NETWORK_CONFIGS[network];
  return config;
}

export function getEnvNetwork(): NetworkName {
  const network = process.env.DECIBEL_NETWORK;
  if (network && network in NETWORK_CONFIGS) {
    return network as NetworkName;
  }
  return DEFAULT_NETWORK;
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

// Gas station fee-payer address, required to submit encrypted transactions
// through a sponsoring gas station (the SDK no longer ships built-in addresses).
export function getEnvGasStationAddress(): string | undefined {
  return process.env.DECIBEL_GAS_STATION_ADDRESS;
}

export function getEnvAccountAlias(): string | undefined {
  return process.env.DECIBEL_ACCOUNT_ALIAS;
}

export function getEnvSubaccountAddress(): string | undefined {
  return process.env.DECIBEL_SUBACCOUNT_ADDRESS;
}
