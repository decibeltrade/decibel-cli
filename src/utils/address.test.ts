import { describe, expect, it } from "vitest";

import { detectAddressType, resolveAptosAddress } from "./address.js";

describe("detectAddressType", () => {
  it("detects ETH addresses (0x + 40 hex)", () => {
    expect(detectAddressType("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045")).toBe("eth");
    expect(detectAddressType("0xab5801a7d398351b8be11c439e05c5b3259aec9b")).toBe("eth");
  });

  it("detects Aptos addresses (0x + 64 hex)", () => {
    expect(
      detectAddressType("0x0000000000000000000000000000000000000000000000000000000000000001"),
    ).toBe("aptos");
    expect(
      detectAddressType("0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"),
    ).toBe("aptos");
  });

  it("detects Solana addresses (base58, 32-44 chars)", () => {
    expect(detectAddressType("11111111111111111111111111111111")).toBe("solana");
    expect(detectAddressType("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")).toBe("solana");
  });

  it("throws on invalid address", () => {
    expect(() => detectAddressType("not-an-address")).toThrow("Unrecognized address format");
    expect(() => detectAddressType("0x123")).toThrow("Unrecognized address format");
    expect(() => detectAddressType("")).toThrow("Unrecognized address format");
  });
});

describe("resolveAptosAddress", () => {
  it("passes through Aptos addresses as-is", () => {
    const aptos = "0x0000000000000000000000000000000000000000000000000000000000000001";
    const result = resolveAptosAddress(aptos);
    expect(result.aptosAddress).toBe(aptos);
    expect(result.addressType).toBe("aptos");
  });

  it("derives Aptos address from ETH address", () => {
    const result = resolveAptosAddress("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045");
    expect(result.addressType).toBe("eth");
    expect(result.aptosAddress).toMatch(/^0x[a-f0-9]{64}$/);
  });

  it("derives Aptos address from Solana address", () => {
    const result = resolveAptosAddress("11111111111111111111111111111111");
    expect(result.addressType).toBe("solana");
    expect(result.aptosAddress).toMatch(/^0x[a-f0-9]{64}$/);
  });
});
