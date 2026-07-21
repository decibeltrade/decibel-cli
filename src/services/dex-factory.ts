import { Account, Ed25519PrivateKey } from "@aptos-labs/ts-sdk";
import { DecibelConfig, DecibelReadDex, DecibelWriteDex } from "@decibeltrade/sdk";

import {
  getAccountByAlias,
  getAptosAccount,
  getDefaultAccount,
  StoredAccount,
} from "../storage/accounts.js";
import {
  getEnvGasStationAddress,
  getEnvGasStationApiKey,
  getEnvNetwork,
  getEnvNodeApiKey,
  getEnvPrivateKey,
  getEnvSubaccountAddress,
  getNetworkConfig,
  NetworkName,
} from "../utils/config.js";

export interface DexOptions {
  network?: NetworkName;
  accountAlias?: string; // Account alias for a stored account
  password?: string; // Password for encrypted private key of a stored account
  subaccountAddress?: string; // Subaccount address (if not using a stored account)
  privateKey?: string; // Private key for API wallet (for signing transactions)
  nodeApiKey?: string;
  gasStationApiKey?: string;
  /** Gas station fee-payer address; required to submit encrypted transactions when sponsored. */
  gasStationAddress?: string;
  /** When true, front-run-sensitive transactions are submitted encrypted (mempool-private). */
  encrypt?: boolean;
}

/**
 * Get the network configuration
 */
export function getConfig(options: DexOptions = {}): DecibelConfig {
  const network = options.network ?? getEnvNetwork();
  const config = getNetworkConfig(network);

  // Gas station credentials are consumer-supplied (the SDK ships none). The
  // fee-payer address is only needed to submit encrypted transactions.
  const gasStationApiKey = options.gasStationApiKey ?? getEnvGasStationApiKey();
  const gasStationAddress = options.gasStationAddress ?? getEnvGasStationAddress();
  if (gasStationApiKey) {
    return {
      ...config,
      gasStationApiKey,
      ...(gasStationAddress && { gasStationAddress }),
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
  options: DexOptions = {},
): Promise<{ account: Account; storedAccount?: StoredAccount }> {
  // Priority 1: Direct private key from options
  if (options.privateKey) {
    const privKey = new Ed25519PrivateKey(options.privateKey);
    return { account: Account.fromPrivateKey({ privateKey: privKey }) };
  }

  // Priority 2: Named account from storage (--account flag)
  if (options.accountAlias) {
    const storedAccount = getAccountByAlias(options.accountAlias);
    if (!storedAccount) {
      throw new Error(
        `Account "${options.accountAlias}" not found. Run "decibel-cli account ls" to see available accounts.`,
      );
    }

    if (storedAccount.type === "read-only") {
      throw new Error(
        `Account "${storedAccount.alias}" is read-only and cannot be used for transactions. Use an api-wallet account instead.`,
      );
    }

    const account = await getAptosAccount(storedAccount, options.password);
    return { account, storedAccount };
  }

  // Priority 3: Environment variable
  const envKey = getEnvPrivateKey();
  if (envKey) {
    const privKey = new Ed25519PrivateKey(envKey);
    return { account: Account.fromPrivateKey({ privateKey: privKey }) };
  }

  // Priority 4: Default account
  const storedAccount = getDefaultAccount();
  if (!storedAccount) {
    throw new Error(
      'No account configured. Run "decibel-cli account add" to add an account, or set DECIBEL_PRIVATE_KEY environment variable.',
    );
  }

  if (storedAccount.type === "read-only") {
    throw new Error(
      `Account "${storedAccount.alias}" is read-only and cannot be used for transactions. Use an api-wallet account instead.`,
    );
  }

  const account = await getAptosAccount(storedAccount, options.password);
  return { account, storedAccount };
}

/**
 * Get the address for the current account (works for read-only too)
 * Priority: subaccountAddress option > account option > env var > default account
 */
export function resolveSubaccountAddress(options: DexOptions = {}): string {
  // Priority 1: Direct address from options
  if (options.subaccountAddress) {
    return options.subaccountAddress;
  }

  // Priority 2: Named account from storage (--account flag)
  if (options.accountAlias) {
    const storedAccount = getAccountByAlias(options.accountAlias);
    if (!storedAccount) {
      throw new Error(`Account "${options.accountAlias}" not found.`);
    }
    return storedAccount.address;
  }

  // Priority 3: Environment variable
  const envSubaccountAddress = getEnvSubaccountAddress();
  if (envSubaccountAddress) {
    return envSubaccountAddress;
  }

  // Priority 4: Default account
  const storedAccount = getDefaultAccount();
  if (!storedAccount) {
    throw new Error("No account configured.");
  }

  return storedAccount.address;
}

/**
 * Create a write SDK instance (requires an account)
 */
export async function createWriteDex(options: DexOptions = {}): Promise<DecibelWriteDex> {
  const config = getConfig(options);
  const { account } = await resolveAccount(options);
  const nodeApiKey = options.nodeApiKey ?? getEnvNodeApiKey();

  return new DecibelWriteDex(config, account, {
    nodeApiKey,
    defaultEncrypted: options.encrypt ?? false,
  });
}
