import { describe, it, expect } from "vitest";

import {
  encryptPrivateKey,
  decryptPrivateKey,
  isValidPrivateKey,
  isValidAddress,
} from "../../src/utils/encryption.js";

describe("encryption utilities", () => {
  describe("isValidPrivateKey", () => {
    it("should return true for valid 64-character hex key", () => {
      const validKey = "0x" + "a".repeat(64);
      expect(isValidPrivateKey(validKey)).toBe(true);
    });

    it("should return true for mixed case hex key", () => {
      // 0x prefix + 64 hex chars = exactly 66 characters total
      const validKey = "0xaAbBcCdDeEfF1234567890abcdef1234567890ABCDEF1234567890abcdef1234";
      expect(validKey.length).toBe(66); // 0x + 64 chars
      expect(isValidPrivateKey(validKey)).toBe(true);
    });

    it("should return false for key without 0x prefix", () => {
      const invalidKey = "a".repeat(64);
      expect(isValidPrivateKey(invalidKey)).toBe(false);
    });

    it("should return false for key with wrong length", () => {
      const shortKey = "0x" + "a".repeat(32);
      const longKey = "0x" + "a".repeat(128);
      expect(isValidPrivateKey(shortKey)).toBe(false);
      expect(isValidPrivateKey(longKey)).toBe(false);
    });

    it("should return false for key with non-hex characters", () => {
      const invalidKey = "0x" + "g".repeat(64);
      expect(isValidPrivateKey(invalidKey)).toBe(false);
    });

    it("should return false for empty string", () => {
      expect(isValidPrivateKey("")).toBe(false);
    });
  });

  describe("isValidAddress", () => {
    it("should return true for 64-character hex address", () => {
      const validAddress = "0x" + "a".repeat(64);
      expect(isValidAddress(validAddress)).toBe(true);
    });

    it("should return true for shorter hex address", () => {
      // Aptos addresses can be shorter if leading zeros are omitted
      const shortAddress = "0x1";
      expect(isValidAddress(shortAddress)).toBe(true);
    });

    it("should return true for address with mixed case", () => {
      const mixedCase = "0xAaBbCcDdEeFf123456789";
      expect(isValidAddress(mixedCase)).toBe(true);
    });

    it("should return false for address without 0x prefix", () => {
      const noPrefix = "a".repeat(64);
      expect(isValidAddress(noPrefix)).toBe(false);
    });

    it("should return false for empty address after prefix", () => {
      expect(isValidAddress("0x")).toBe(false);
    });

    it("should return false for address with non-hex characters", () => {
      const invalidAddress = "0x" + "g".repeat(10);
      expect(isValidAddress(invalidAddress)).toBe(false);
    });

    it("should return false for address longer than 64 chars after prefix", () => {
      const longAddress = "0x" + "a".repeat(65);
      expect(isValidAddress(longAddress)).toBe(false);
    });
  });

  describe("encryptPrivateKey and decryptPrivateKey", () => {
    const testPrivateKey = "0x" + "abcdef1234567890".repeat(4);
    const testPassword = "secure-password-123";

    it("should encrypt and decrypt a private key", async () => {
      const encrypted = await encryptPrivateKey(testPrivateKey, testPassword);
      const decrypted = await decryptPrivateKey(encrypted, testPassword);

      expect(decrypted).toBe(testPrivateKey);
    });

    it("should produce different encrypted values for same input", async () => {
      // Due to random salt/IV, same input should produce different outputs
      const encrypted1 = await encryptPrivateKey(testPrivateKey, testPassword);
      const encrypted2 = await encryptPrivateKey(testPrivateKey, testPassword);

      expect(encrypted1).not.toBe(encrypted2);
    });

    it("should fail decryption with wrong password", async () => {
      const encrypted = await encryptPrivateKey(testPrivateKey, testPassword);

      await expect(
        decryptPrivateKey(encrypted, "wrong-password")
      ).rejects.toThrow();
    });

    it("should handle empty password", async () => {
      const encrypted = await encryptPrivateKey(testPrivateKey, "");
      const decrypted = await decryptPrivateKey(encrypted, "");

      expect(decrypted).toBe(testPrivateKey);
    });

    it("should handle unicode in private key value", async () => {
      // While real keys are hex, testing unicode handling
      const unicodeValue = "0xtest-key-with-üñíçödé";
      const encrypted = await encryptPrivateKey(unicodeValue, testPassword);
      const decrypted = await decryptPrivateKey(encrypted, testPassword);

      expect(decrypted).toBe(unicodeValue);
    });

    it("should handle special characters in password", async () => {
      const specialPassword = "p@$$w0rd!#%^&*()_+{}|:<>?";
      const encrypted = await encryptPrivateKey(testPrivateKey, specialPassword);
      const decrypted = await decryptPrivateKey(encrypted, specialPassword);

      expect(decrypted).toBe(testPrivateKey);
    });

    it("should produce base64 encoded output", async () => {
      const encrypted = await encryptPrivateKey(testPrivateKey, testPassword);
      // Should be valid base64
      expect(() => Buffer.from(encrypted, "base64")).not.toThrow();
      // Should not start with 0x (raw key format)
      expect(encrypted.startsWith("0x")).toBe(false);
    });
  });
});
