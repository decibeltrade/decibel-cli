import { Account, Ed25519PrivateKey } from "@aptos-labs/ts-sdk";

import {
  decryptPrivateKey,
  encryptPrivateKey,
  isValidAddress,
  isValidPrivateKey,
} from "../utils/encryption.js";
import { getDatabase } from "./database.js";

export interface StoredAccount {
  id: number;
  alias: string;
  address: string;
  encryptedKey: string | null;
  type: "api-wallet" | "read-only";
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AccountRow {
  id: number;
  alias: string;
  address: string;
  encrypted_key: string | null;
  type: "api-wallet" | "read-only";
  is_default: number;
  created_at: string;
  updated_at: string;
}

function rowToAccount(row: AccountRow): StoredAccount {
  return {
    id: row.id,
    alias: row.alias,
    address: row.address,
    encryptedKey: row.encrypted_key,
    type: row.type,
    isDefault: row.is_default === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Add a new account to the database
 */
export async function addAccount(params: {
  alias: string;
  type: "api-wallet" | "read-only";
  subaccountAddress: string;
  privateKey?: string;
  isDefault?: boolean;
  password?: string;
}): Promise<StoredAccount> {
  const { alias, type, subaccountAddress, privateKey, isDefault = false, password } = params;

  // Validate inputs
  if (!subaccountAddress) {
    throw new Error("Subaccount address is required");
  }
  if (!isValidAddress(subaccountAddress)) {
    throw new Error("Invalid address format. Must be a hex string starting with 0x");
  }

  if (type === "api-wallet") {
    if (!privateKey) {
      throw new Error("Private key is required for api-wallet type");
    }
    if (!isValidPrivateKey(privateKey)) {
      throw new Error("Invalid private key format. Must be a hex string starting with 0x");
    }
  }

  const db = getDatabase();

  // Check if alias already exists
  const existing = db.prepare("SELECT id FROM accounts WHERE alias = ?").get(alias);
  if (existing) {
    throw new Error(`Account with alias "${alias}" already exists`);
  }

  let encryptedKey: string | null = null;

  if (type === "api-wallet" && privateKey) {
    // Encrypt the private key if password provided, otherwise store plain
    // Note: For security, we always recommend using a password
    if (password) {
      encryptedKey = await encryptPrivateKey(privateKey, password);
    } else {
      // Store without encryption (not recommended for production)
      encryptedKey = privateKey;
    }
  }

  // If this should be the default, clear other defaults first
  if (isDefault) {
    db.prepare("UPDATE accounts SET is_default = 0, updated_at = datetime('now')").run();
  }

  // Insert the new account
  const result = db
    .prepare(
      `INSERT INTO accounts (alias, address, encrypted_key, type, is_default, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    )
    .run(alias, subaccountAddress, encryptedKey, type, isDefault ? 1 : 0);

  // If this is the first account, make it default
  const count = db.prepare("SELECT COUNT(*) as count FROM accounts").get() as { count: number };
  if (count.count === 1) {
    db.prepare("UPDATE accounts SET is_default = 1, updated_at = datetime('now') WHERE id = ?").run(
      result.lastInsertRowid,
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return getAccountById(Number(result.lastInsertRowid))!;
}

/**
 * Get all accounts
 */
export function getAllAccounts(): StoredAccount[] {
  const db = getDatabase();
  const rows = db
    .prepare("SELECT * FROM accounts ORDER BY is_default DESC, alias ASC")
    .all() as AccountRow[];
  return rows.map(rowToAccount);
}

/**
 * Get account by ID
 */
export function getAccountById(id: number): StoredAccount | null {
  const db = getDatabase();
  const row = db.prepare("SELECT * FROM accounts WHERE id = ?").get(id) as AccountRow | undefined;
  return row ? rowToAccount(row) : null;
}

/**
 * Get account by alias
 */
export function getAccountByAlias(alias: string): StoredAccount | null {
  const db = getDatabase();
  const row = db.prepare("SELECT * FROM accounts WHERE alias = ?").get(alias) as
    | AccountRow
    | undefined;
  return row ? rowToAccount(row) : null;
}

/**
 * Get the default account
 */
export function getDefaultAccount(): StoredAccount | null {
  const db = getDatabase();
  const row = db.prepare("SELECT * FROM accounts WHERE is_default = 1").get() as
    | AccountRow
    | undefined;
  return row ? rowToAccount(row) : null;
}

/**
 * Set an account as the default
 */
export function setDefaultAccount(alias: string): StoredAccount {
  const db = getDatabase();

  // Check account exists
  const account = getAccountByAlias(alias);
  if (!account) {
    throw new Error(`Account with alias "${alias}" not found`);
  }

  // Clear existing default
  db.prepare("UPDATE accounts SET is_default = 0, updated_at = datetime('now')").run();

  // Set new default
  db.prepare(
    "UPDATE accounts SET is_default = 1, updated_at = datetime('now') WHERE alias = ?",
  ).run(alias);

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return getAccountByAlias(alias)!;
}

/**
 * Remove an account
 */
export function removeAccount(alias: string): boolean {
  const db = getDatabase();

  const account = getAccountByAlias(alias);
  if (!account) {
    return false;
  }

  db.prepare("DELETE FROM accounts WHERE alias = ?").run(alias);

  // If the removed account was default, make the first remaining account default
  if (account.isDefault) {
    const first = db.prepare("SELECT * FROM accounts ORDER BY id ASC LIMIT 1").get() as
      | AccountRow
      | undefined;
    if (first) {
      db.prepare(
        "UPDATE accounts SET is_default = 1, updated_at = datetime('now') WHERE id = ?",
      ).run(first.id);
    }
  }

  return true;
}

/**
 * Get the Aptos Account object from a stored account
 * Requires password if the key was encrypted
 */
export async function getAptosAccount(
  storedAccount: StoredAccount,
  password?: string,
): Promise<Account> {
  if (storedAccount.type === "read-only") {
    throw new Error("Cannot create Aptos Account from read-only account");
  }

  if (!storedAccount.encryptedKey) {
    throw new Error("Account has no stored private key");
  }

  let privateKey: string;

  // Check if the key is encrypted (encrypted keys are longer base64 strings)
  // Plain keys start with 0x or ed25519-priv- (AIP-80 format)
  if (
    storedAccount.encryptedKey.startsWith("0x") ||
    storedAccount.encryptedKey.startsWith("ed25519-priv-")
  ) {
    privateKey = storedAccount.encryptedKey;
  } else {
    if (!password) {
      throw new Error("Password required to decrypt account");
    }
    privateKey = await decryptPrivateKey(storedAccount.encryptedKey, password);
  }

  const privKey = new Ed25519PrivateKey(privateKey);
  return Account.fromPrivateKey({ privateKey: privKey });
}

/**
 * Update account alias
 */
export function updateAccountAlias(oldAlias: string, newAlias: string): StoredAccount {
  const db = getDatabase();

  // Check account exists
  const account = getAccountByAlias(oldAlias);
  if (!account) {
    throw new Error(`Account with alias "${oldAlias}" not found`);
  }

  // Check new alias doesn't exist
  const existing = getAccountByAlias(newAlias);
  if (existing) {
    throw new Error(`Account with alias "${newAlias}" already exists`);
  }

  db.prepare("UPDATE accounts SET alias = ?, updated_at = datetime('now') WHERE alias = ?").run(
    newAlias,
    oldAlias,
  );

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return getAccountByAlias(newAlias)!;
}
