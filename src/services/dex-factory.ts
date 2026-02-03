import { Account, AccountAddress, createObjectAddress, Ed25519PrivateKey, MoveString } from "@aptos-labs/ts-sdk";
import {
  DecibelConfig,
  DecibelReadDex,
  DecibelWriteDex,
} from "@decibeltrade/sdk";

import {
  getAptosAccount,
  getAccountByAlias,
  getDefaultAccount,
  StoredAccount,
} from "../storage/accounts.js";
import {
  getEnvGasStationApiKey,
  getEnvNetwork,
  getEnvNodeApiKey,
  getEnvPrivateKey,
  getNetworkConfig,
  NetworkName,
} from "../utils/config.js";

export interface DexOptions {
  network?: NetworkName;
  account?: string; // Account alias
  privateKey?: string; // Direct private key (overrides account)
  password?: string; // For encrypted accounts
  nodeApiKey?: string;
  gasStationApiKey?: string;
}

/**
 * Get the network configuration
 */
export function getConfig(options: DexOptions = {}): DecibelConfig {
  const network = options.network ?? getEnvNetwork();
  const config = getNetworkConfig(network);

  // Override gas station API key if provided
  const gasStationApiKey = options.gasStationApiKey ?? getEnvGasStationApiKey();
  if (gasStationApiKey) {
    return {
      ...config,
      gasStationApiKey,
    };
  }

  return config;
}

/**
 * Create a read-only SDK instance
 */
export function createReadDex(options: DexOptions = {}): DecibelReadDex {
  const config = getConfig(options);
  const nodeApiKey = options.nodeApiKey ?? getEnvNodeApiKey();

  return new DecibelReadDex(config, {
    nodeApiKey,
    onWsError: (error) => {
      console.error("WebSocket error:", error.message);
    },
  });
}

/**
 * Resolve the account to use for transactions
 * Priority: privateKey option > account option > env var > default account
 */
export async function resolveAccount(
  options: DexOptions = {}
): Promise<{ account: Account; storedAccount?: StoredAccount }> {
  // Priority 1: Direct private key from options
  if (options.privateKey) {
    const privKey = new Ed25519PrivateKey(options.privateKey);
    return { account: Account.fromPrivateKey({ privateKey: privKey }) };
  }

  // Priority 2: Environment variable
  const envKey = getEnvPrivateKey();
  if (envKey) {
    const privKey = new Ed25519PrivateKey(envKey);
    return { account: Account.fromPrivateKey({ privateKey: privKey }) };
  }

  // Priority 3: Named account from storage
  let storedAccount: StoredAccount | null = null;

  if (options.account) {
    storedAccount = getAccountByAlias(options.account);
    if (!storedAccount) {
      throw new Error(`Account "${options.account}" not found. Run "decibel-cli account ls" to see available accounts.`);
    }
  } else {
    // Priority 4: Default account
    storedAccount = getDefaultAccount();
    if (!storedAccount) {
      throw new Error(
        "No account configured. Run \"decibel-cli account add\" to add an account, or set DECIBEL_PRIVATE_KEY environment variable."
      );
    }
  }

  if (storedAccount.type === "read-only") {
    throw new Error(
      `Account "${storedAccount.alias}" is read-only and cannot be used for transactions. Use an api-wallet account instead.`
    );
  }

  const account = await getAptosAccount(storedAccount, options.password);
  return { account, storedAccount };
}

/**
 * Get the address for the current account (works for read-only too)
 */
export function resolveAddress(options: DexOptions = {}): string {
  // Priority 1: Direct private key from options
  if (options.privateKey) {
    const privKey = new Ed25519PrivateKey(options.privateKey);
    const account = Account.fromPrivateKey({ privateKey: privKey });
    return account.accountAddress.toString();
  }

  // Priority 2: Environment variable
  const envKey = getEnvPrivateKey();
  if (envKey) {
    const privKey = new Ed25519PrivateKey(envKey);
    const account = Account.fromPrivateKey({ privateKey: privKey });
    return account.accountAddress.toString();
  }

  // Priority 3: Named account from storage
  let storedAccount: StoredAccount | null = null;

  if (options.account) {
    storedAccount = getAccountByAlias(options.account);
    if (!storedAccount) {
      throw new Error(`Account "${options.account}" not found.`);
    }
  } else {
    storedAccount = getDefaultAccount();
    if (!storedAccount) {
      throw new Error("No account configured.");
    }
  }

  return storedAccount.address;
}

/**
 * Create a write SDK instance (requires an account)
 */
export async function createWriteDex(
  options: DexOptions = {}
): Promise<DecibelWriteDex> {
  const config = getConfig(options);
  const { account } = await resolveAccount(options);
  const nodeApiKey = options.nodeApiKey ?? getEnvNodeApiKey();

  return new DecibelWriteDex(config, account, {
    nodeApiKey,
  });
}

/**
 * Get subaccount seed bytes for address derivation
 */
function getSubaccountSeedBytes(ownerAddr: AccountAddress, seed: string): Uint8Array {
  return new Uint8Array([...ownerAddr.toUint8Array(), ...new MoveString(seed).bcsToBytes()]);
}

/**
 * Get primary subaccount address from wallet address
 * Implements the same logic as SDK's getPrimarySubaccountAddr
 */
export function getSubaccountAddress(
  walletAddress: string,
  config: DecibelConfig
): string {
  const account = AccountAddress.fromString(walletAddress);
  const packageAddress = AccountAddress.fromString(config.deployment.package);

  // Derive the GlobalSubaccountManager address
  const deriver = createObjectAddress(
    packageAddress,
    new TextEncoder().encode("GlobalSubaccountManager")
  );

  // Derive the primary subaccount address
  const subaccountAddr = createObjectAddress(
    deriver,
    getSubaccountSeedBytes(account, "primary_subaccount")
  );

  return subaccountAddr.toString();
}
