import { createCipheriv, createDecipheriv, randomBytes, scrypt } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const AUTH_TAG_LENGTH = 16;

/**
 * Derive a key from a password using scrypt
 */
async function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  const key = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return key;
}

/**
 * Encrypt a private key using a password
 * Returns base64-encoded string containing: salt + iv + authTag + ciphertext
 */
export async function encryptPrivateKey(privateKey: string, password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = await deriveKey(password, salt);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(privateKey, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Combine salt + iv + authTag + ciphertext
  const combined = Buffer.concat([salt, iv, authTag, encrypted]);
  return combined.toString("base64");
}

/**
 * Decrypt a private key using a password
 * Input is base64-encoded string containing: salt + iv + authTag + ciphertext
 */
export async function decryptPrivateKey(encryptedData: string, password: string): Promise<string> {
  const combined = Buffer.from(encryptedData, "base64");

  // Extract components
  const salt = combined.subarray(0, SALT_LENGTH);
  const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const authTag = combined.subarray(
    SALT_LENGTH + IV_LENGTH,
    SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH,
  );
  const ciphertext = combined.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

  const key = await deriveKey(password, salt);

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return decrypted.toString("utf8");
}

/**
 * Validate that a string looks like a valid private key
 * Supports both formats:
 * - 0x... (64 hex characters)
 * - ed25519-priv-0x... (AIP-80 compliant format)
 */
export function isValidPrivateKey(key: string): boolean {
  // Standard hex format: 0x + 64 hex chars
  const hexRegex = /^0x[a-fA-F0-9]{64}$/;
  // AIP-80 format: ed25519-priv-0x + 64 hex chars
  const aip80Regex = /^ed25519-priv-0x[a-fA-F0-9]{64}$/;
  return hexRegex.test(key) || aip80Regex.test(key);
}

/**
 * Validate that a string looks like a valid address
 * (hex string starting with 0x, 64 hex characters after prefix)
 */
export function isValidAddress(address: string): boolean {
  const hexRegex = /^0x[a-fA-F0-9]{1,64}$/;
  return hexRegex.test(address);
}
