import { deriveAptosFromEth, deriveAptosFromSolana } from "@decibeltrade/sdk";

export type AddressType = "eth" | "solana" | "aptos";

/**
 * Detect wallet address type by format:
 * - ETH:    0x + 40 hex chars (20 bytes)
 * - Aptos:  0x + 64 hex chars (32 bytes)
 * - Solana: base58 string (32-44 chars, no 0x prefix)
 */
export function detectAddressType(address: string): AddressType {
  if (/^0x[a-fA-F0-9]{40}$/.test(address)) return "eth";
  if (/^0x[a-fA-F0-9]{64}$/.test(address)) return "aptos";
  // Base58 alphabet: 1-9, A-H, J-N, P-Z, a-k, m-z (no 0, I, O, l)
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return "solana";
  throw new Error(`Unrecognized address format: ${address}`);
}

/**
 * Resolve any supported wallet address to a standardized Aptos address.
 * - ETH/Solana: derives via the derivable account pattern (scheme 0x05)
 * - Aptos: returns as-is (already a valid Aptos address)
 */
export function resolveAptosAddress(address: string): {
  aptosAddress: string;
  addressType: AddressType;
} {
  const addressType = detectAddressType(address);
  switch (addressType) {
    case "eth":
      return { aptosAddress: deriveAptosFromEth(address), addressType };
    case "solana":
      return { aptosAddress: deriveAptosFromSolana(address), addressType };
    case "aptos":
      return { aptosAddress: address.toLowerCase(), addressType };
  }
}
