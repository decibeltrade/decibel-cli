import { randomBytes } from "crypto";

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const CODE_LENGTH = 6;

/**
 * Generate a cryptographically random 6-character referral code.
 * Charset: A-Z0-9 (36^6 = 2,176,782,336 keyspace).
 * Matches the Rust generate_referral_code() in handle_redeem_referral.rs.
 */
export function generateReferralCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  return Array.from(bytes)
    .map((b) => CHARS[b % CHARS.length])
    .join("");
}

/**
 * Generate n unique referral codes.
 */
export function generateUniqueCodes(count: number): string[] {
  const codes = new Set<string>();
  while (codes.size < count) {
    codes.add(generateReferralCode());
  }
  return [...codes];
}
